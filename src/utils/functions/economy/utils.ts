import { GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import * as fs from "fs";
import fetch from "node-fetch";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { AchievementData, Item } from "../../../types/Economy";
import { Worker, WorkerUpgrades } from "../../../types/Workers";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getTier, isPremium } from "../premium/premium";
import { createProfile, hasProfile } from "../users/utils";
import { setProgress } from "./achievements";
import { calcMaxBet, getBalance, getMulti, updateBalance } from "./balance";
import { getGuildByUser } from "./guilds";
import { addInventoryItem } from "./inventory";
import { getXp, updateXp } from "./xp";
import ms = require("ms");
import dayjs = require("dayjs");

let items: { [key: string]: Item };
let achievements: { [key: string]: AchievementData };
let baseWorkers: { [key: string]: Worker };
let baseUpgrades: { [key: string]: WorkerUpgrades };

const lotteryTicketPrice = 15000;
/**
 * higher ticket price = more favourable to rich people cus poor people cant buy tickets resulting in less tickets overall
 * the goal is to have more tickets overall for a more random outcome
 */
export { lotteryTicketPrice };

export function loadItems(crypto = true) {
  const itemsFile: any = fs.readFileSync("./data/items.json");
  const achievementsFile: any = fs.readFileSync("./data/achievements.json");

  const workersFile: any = fs.readFileSync("./data/workers.json");

  items = JSON.parse(itemsFile);
  achievements = JSON.parse(achievementsFile);
  baseWorkers = JSON.parse(workersFile).workers;
  baseUpgrades = JSON.parse(workersFile).upgrades;

  const workerIds = Object.keys(baseWorkers);

  inPlaceSort(workerIds).asc((w) => baseWorkers[w].prestige_requirement);

  const newObj: { [key: string]: Worker } = {};

  for (const workerId of workerIds) {
    newObj[workerId] = baseWorkers[workerId];
  }

  baseWorkers = newObj;

  logger.info(`${Object.keys(baseWorkers).length} workers loaded`);
  logger.info(`${Object.keys(baseUpgrades).length} worker upgrades loaded`);

  logger.info(`${Array.from(Object.keys(items)).length.toLocaleString()} economy items loaded`);
  logger.info(`${Object.keys(achievements).length.toLocaleString()} achievements loaded`);

  if (crypto) {
    setTimeout(() => {
      updateCryptoWorth();
    }, 50);
  }
}

function randomOffset() {
  return Math.floor(Math.random() * 50000);
}

let padlockPrice = 25000 + randomOffset();

async function updateCryptoWorth() {
  let res = await fetch("https://api.coindesk.com/v1/bpi/currentprice/USD.json").then((res) => res.json());

  const btcworth = Math.floor(res.bpi.USD.rate_float);

  items["bitcoin"].buy = btcworth;
  items["bitcoin"].sell = btcworth;
  logger.info("bitcoin worth updated: $" + items["bitcoin"].buy.toLocaleString());

  res = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=ETH").then((res) => res.json());

  const ethWorth = Math.floor(res.data.rates.USD);

  if (!ethWorth) {
    logger.error("INVALID ETH WORTH");
    return logger.error(res);
  }

  items["ethereum"].buy = ethWorth;
  items["ethereum"].sell = ethWorth;
  logger.info("ethereum worth updated: $" + items["ethereum"].buy.toLocaleString());
}

export function getBaseWorkers() {
  return baseWorkers;
}

export function getBaseUpgrades() {
  return baseUpgrades;
}

export function getPadlockPrice(): number {
  return padlockPrice;
}

export function runEconomySetup() {
  setInterval(updateCryptoWorth, 1500000);

  loadItems();

  items["padlock"].buy = padlockPrice;
  items["padlock"].sell = padlockPrice / 3;

  setInterval(() => {
    padlockPrice = 25000 + randomOffset();
    items["padlock"].buy = padlockPrice;
    items["padlock"].sell = Math.floor(padlockPrice / 3);
  }, 3600000);
}

export async function userExists(member: GuildMember | string): Promise<boolean> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (!id) return;

  if (await redis.exists(`${Constants.redis.cache.economy.EXISTS}:${id}`)) {
    return (await redis.get(`${Constants.redis.cache.economy.EXISTS}:${id}`)) === "true" ? true : false;
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      userId: true,
    },
  });

  if (query) {
    await redis.set(`${Constants.redis.cache.economy.EXISTS}:${id}`, "true");
    await redis.expire(`${Constants.redis.cache.economy.EXISTS}:${id}`, ms("1 hour") / 1000);
    return true;
  } else {
    await redis.set(`${Constants.redis.cache.economy.EXISTS}:${id}`, "false");
    await redis.expire(`${Constants.redis.cache.economy.EXISTS}:${id}`, ms("1 hour") / 1000);
    return false;
  }
}

export async function createUser(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (!(await hasProfile(id))) {
    if (member instanceof GuildMember) {
      await createProfile(member.user);
    } else {
      await createProfile(id);
    }
  }

  await prisma.economy.create({
    data: {
      userId: id,
      lastVote: new Date(0),
      lastDaily: new Date(0),
    },
  });
  await redis.del(`${Constants.redis.cache.economy.EXISTS}:${id}`);
  await addInventoryItem(id, "beginner_booster", 1, false);
}

export async function formatBet(bet: string | number, member: GuildMember): Promise<number | void> {
  const maxBet = await calcMaxBet(member);

  if (bet.toString().toLowerCase() == "all") {
    bet = await getBalance(member);
    if (bet > maxBet) {
      bet = maxBet;
    }
  } else if (bet.toString().toLowerCase() == "max") {
    bet = maxBet;
  } else if (bet.toString().toLowerCase() == "half") {
    bet = Math.floor((await getBalance(member)) / 2);
  }

  const formatted = formatNumber(bet.toString());

  if (formatted) {
    bet = formatted;
  } else {
    return null;
  }

  if (bet <= 0) return null;

  return bet;
}

export function formatNumber(number: string | number): number | void {
  if (number.toString().includes("b")) {
    number = parseFloat(number.toString()) * 1000000000;
  } else if (number.toString().includes("m")) {
    number = parseFloat(number.toString()) * 1000000;
  } else if (number.toString().includes("k")) {
    number = parseFloat(number.toString()) * 1000;
  }

  if (isNaN(parseFloat(number.toString()))) return null;

  return Math.floor(parseFloat(number.toString()));
}

export async function isEcoBanned(id: string) {
  if (await redis.exists(`${Constants.redis.cache.economy.BANNED}:${id}`)) {
    const res = (await redis.get(`${Constants.redis.cache.economy.BANNED}:${id}`)) === "t" ? true : false;

    if (res) await redis.del(`${Constants.redis.cache.economy.BANNED}:${id}`);
    return res;
  } else {
    const query = await prisma.economy.findUnique({
      where: {
        userId: id,
      },
      select: {
        banned: true,
      },
    });

    if (!query || !query.banned) {
      await redis.set(`${Constants.redis.cache.economy.BANNED}:${id}`, "f");
      await redis.expire(`${Constants.redis.cache.economy.BANNED}:${id}`, ms("1 hour") / 1000);
      return false;
    }

    if (dayjs().isBefore(query.banned)) {
      await redis.set(`${Constants.redis.cache.economy.BANNED}:${id}`, "t");
      await redis.expire(`${Constants.redis.cache.economy.BANNED}:${id}`, ms("1 hour") / 1000);
      return true;
    } else {
      await redis.set(`${Constants.redis.cache.economy.BANNED}:${id}`, "f");
      await redis.expire(`${Constants.redis.cache.economy.BANNED}:${id}`, ms("1 hour") / 1000);
      return false;
    }
  }
}

export async function getEcoBanTime(id: string) {
  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      banned: true,
    },
  });

  return query.banned;
}

export async function setEcoBan(id: string, date?: Date) {
  if (!date) {
    await prisma.economy.update({
      where: {
        userId: id,
      },
      data: {
        banned: new Date(0),
      },
    });
  } else {
    await prisma.economy.update({
      where: {
        userId: id,
      },
      data: {
        banned: date,
      },
    });
  }

  await redis.del(`${Constants.redis.cache.economy.BANNED}:${id}`);
}

export async function reset() {
  await prisma.lotteryTicket.deleteMany();
  await prisma.$executeRaw`ALTER SEQUENCE "LotteryTicket_id_seq" RESTART WITH 1;`;
  await prisma.booster.deleteMany();
  await prisma.economyStats.deleteMany();
  await prisma.economyGuildMember.deleteMany();
  await prisma.economyGuild.deleteMany();
  await prisma.auction.deleteMany();
  await prisma.economyWorkerUpgrades.deleteMany();
  await prisma.economyWorker.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.crafting.deleteMany();

  await prisma.economy.deleteMany({
    where: {
      banned: { gt: new Date() },
    },
  });

  const deleted = await prisma.economy
    .deleteMany({
      where: {
        AND: [
          { prestige: 0 },
          { lastVote: { lt: new Date(Date.now() - ms("12 hours")) } },
          { dailyStreak: { lt: 2 } },
          { auction_watch: { isEmpty: true } },
        ],
      },
    })
    .then((r) => r.count);

  const query = await prisma.economy.findMany();
  let updated = 0;

  for (const user of query) {
    await prisma.economy.update({
      where: {
        userId: user.userId,
      },
      data: {
        money: 500,
        bank: 9500,
        bankStorage: 5000,
        defaultBet: 0,
        xp: 0,
        padlock: false,
      },
    });

    updated++;

    await redis.del(`${Constants.redis.cache.economy.EXISTS}:${user.userId}`);
    await redis.del(`${Constants.redis.cache.economy.BANNED}:${user.userId}`);
    await redis.del(`${Constants.redis.cache.economy.PRESTIGE}:${user.userId}`);
    await redis.del(`${Constants.redis.cache.economy.EXISTS}:${user.userId}`);
    await redis.del(`${Constants.redis.cache.economy.XP}:${user.userId}`);
    await redis.del(`${Constants.redis.cache.economy.BALANCE}:${user.userId}`);
    await redis.del(`${Constants.redis.cache.economy.BOOSTERS}:${user.userId}`);
    await redis.del(`economy:handcuffed:${user.userId}`);
    await redis.del(`${Constants.redis.cache.economy.GUILD_USER}:${user.userId}`);
    await redis.del(`${Constants.redis.cache.economy.NETWORTH}:${user.userId}`);
    await redis.del(`${Constants.redis.nypsi.STEVE_EARNED}:${user.userId}`);
  }

  return updated + deleted;
}

export function getItems(): { [key: string]: Item } {
  if (!items) {
    const itemsFile: any = fs.readFileSync("./data/items.json");

    return JSON.parse(itemsFile);
  }

  return items;
}

export function getAchievements() {
  return achievements;
}

export async function deleteUser(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await redis.del(`${Constants.redis.cache.economy.NETWORTH}:${id}`);
  await redis.del(`${Constants.redis.cache.economy.INVENTORY}:${id}`);
  await redis.del(`${Constants.redis.cache.economy.PRESTIGE}:${id}`);

  const guild = await getGuildByUser(member);

  if (guild) {
    if (guild.ownerId == id) {
      await prisma.economyGuildMember.deleteMany({
        where: { guildName: guild.guildName },
      });

      await prisma.economyGuild.delete({
        where: {
          guildName: guild.guildName,
        },
      });
    } else {
      await prisma.economyGuildMember.delete({
        where: {
          userId: id,
        },
      });
    }
  }

  await prisma.booster.deleteMany({
    where: { userId: id },
  });
  await prisma.economyStats.deleteMany({
    where: {
      economyUserId: id,
    },
  });
  await prisma.economy.delete({
    where: {
      userId: id,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.EXISTS}:${id}`);
  await redis.del(`${Constants.redis.cache.economy.BANNED}:${id}`);
  await redis.del(`${Constants.redis.cache.economy.PRESTIGE}:${id}`);
  await redis.del(`${Constants.redis.cache.economy.EXISTS}:${id}`);
  await redis.del(`${Constants.redis.cache.economy.XP}:${id}`);
  await redis.del(`${Constants.redis.cache.economy.BALANCE}:${id}`);
  await redis.del(`${Constants.redis.cache.economy.BOOSTERS}:${id}`);
  await redis.del(`${Constants.redis.cache.economy.GUILD_USER}:${id}`);
}

export async function getTickets(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.lotteryTicket.findMany({
    where: {
      userId: id,
    },
  });

  return query;
}

export async function addTicket(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.lotteryTicket.create({
    data: {
      userId: id,
    },
  });

  if (!(member instanceof GuildMember)) return;

  await redis.hincrby("lotterytickets:queue", member.user.username, 1);
}

export async function isHandcuffed(id: string): Promise<boolean> {
  return (await redis.exists(`economy:handcuffed:${id}`)) == 1 ? true : false;
}

export async function addHandcuffs(id: string) {
  await redis.set(`economy:handcuffed:${id}`, Date.now());
  await redis.expire(`economy:handcuffed:${id}`, 60);
}

export async function getLastDaily(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      lastDaily: true,
    },
  });

  return query.lastDaily;
}

export async function updateLastDaily(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.economy.update({
    where: {
      userId: id,
    },
    data: {
      lastDaily: new Date(),
      dailyStreak: { increment: 1 },
    },
  });
}

export async function getDailyStreak(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      dailyStreak: true,
    },
  });

  return query.dailyStreak;
}

export async function doDaily(member: GuildMember) {
  const streak = (await getDailyStreak(member)) + 1;

  const base = 20000;

  let streakBonus = 5000;

  if (await isPremium(member)) {
    const tier = await getTier(member);

    switch (tier) {
      case 1:
        streakBonus = 5500;
        break;
      case 2:
        streakBonus = 6000;
        break;
      case 3:
        streakBonus = 6500;
        break;
      case 4:
        streakBonus = 7500;
        break;
    }
  }

  let total = base + streakBonus * streak;

  total += Math.floor(total * (await getMulti(member)));

  let xp = 1;
  let crate = 0;

  if (streak > 5) {
    xp = Math.floor((streak - 5) / 10);
  }

  if (streak > 0 && streak % 7 == 0) {
    crate++;

    crate += Math.floor(streak / 30);

    await addInventoryItem(member, "basic_crate", crate);
  }

  if (streak == 69) {
    await addInventoryItem(member, "69420_crate", 3);
  }

  await updateBalance(member, (await getBalance(member)) + total);
  await updateLastDaily(member);

  const embed = new CustomEmbed(member);
  embed.setHeader("daily", member.user.avatarURL());
  embed.setDescription(
    `+$**${total.toLocaleString()}**${
      crate ? `\n+ **${crate}** basic crate${crate > 1 ? "s" : ""}` : streak == 69 ? "\n+ **3** 69420 crates" : ""
    }\ndaily streak: \`${streak}\``
  );

  if (xp > 0) {
    await updateXp(member, (await getXp(member)) + xp);
    embed.setFooter({ text: `+${xp}xp` });
  }

  await setProgress(member.id, "streaker", streak);

  return embed;
}
