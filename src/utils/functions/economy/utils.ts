import { exec } from "child_process";
import { GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import * as fs from "fs";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import {
  AchievementData,
  BakeryUpgradeData,
  GuildUpgrade,
  Item,
  UserUpgrade,
} from "../../../types/Economy";
import { Tag } from "../../../types/Tags";
import { Worker, WorkerUpgrades } from "../../../types/Workers";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getAllGroupAccountIds } from "../moderation/alts";
import { isUserBlacklisted } from "../users/blacklist";
import { getPreferences } from "../users/notifications";
import { createProfile, hasProfile } from "../users/utils";
import { setProgress } from "./achievements";
import { calcMaxBet, getBalance, updateBalance } from "./balance";
import { getGuildByUser } from "./guilds";
import { addInventoryItem } from "./inventory";
import { addStat } from "./stats";
import { getXp, updateXp } from "./xp";
import ms = require("ms");
import math = require("mathjs");

let items: { [key: string]: Item };
let achievements: { [key: string]: AchievementData };
let baseWorkers: { [key: string]: Worker };
let baseUpgrades: { [key: string]: WorkerUpgrades };
let bakeryUpgrades: { [key: string]: BakeryUpgradeData };
let guildUpgrades: { [key: string]: GuildUpgrade };
let userUpgrades: { [key: string]: UserUpgrade };
let tags: { [key: string]: Tag };

const lotteryTicketPrice = 50000;
/**
 * higher ticket price = more favourable to rich people cus poor people cant buy tickets resulting in less tickets overall
 * the goal is to have more tickets overall for a more random outcome
 */
export { lotteryTicketPrice };

export let maxPrestige = 0;

export function loadItems(crypto = true) {
  const itemsFile: any = fs.readFileSync("./data/items.json");
  const achievementsFile: any = fs.readFileSync("./data/achievements.json");
  const workersFile: any = fs.readFileSync("./data/workers.json");
  const bakeryFile: any = fs.readFileSync("./data/bakery_upgrades.json");
  const guildUpgradesFile: any = fs.readFileSync("./data/guild_upgrades.json");
  const tagsFile: any = fs.readFileSync("./data/tags.json");
  const userUpgradesFile: any = fs.readFileSync("./data/upgrades.json");

  items = JSON.parse(itemsFile);
  achievements = JSON.parse(achievementsFile);
  baseWorkers = JSON.parse(workersFile).workers;
  baseUpgrades = JSON.parse(workersFile).upgrades;
  bakeryUpgrades = JSON.parse(bakeryFile);
  guildUpgrades = JSON.parse(guildUpgradesFile);
  tags = JSON.parse(tagsFile);
  userUpgrades = JSON.parse(userUpgradesFile);

  Object.values(userUpgrades).forEach((i) => {
    maxPrestige += i.max;
  });

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
  logger.info(`${Object.keys(tags).length} tags loaded`);
  logger.info(`${Object.keys(userUpgrades).length} user upgrades loaded`);
  logger.info(`max prestige set at P${maxPrestige}`);

  if (crypto) {
    setTimeout(() => {
      updateCryptoWorth();
    }, 50);
  }
}

async function updateCryptoWorth() {
  let res = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=BTC").then((res) =>
    res.json(),
  );

  const btcworth = Math.floor(res.data.rates.USD);

  if (btcworth > 1_000_000) {
    logger.error("FATAL - something wrong with btc");
    return;
  }

  items["bitcoin"].buy = btcworth;
  items["bitcoin"].sell = Math.floor(btcworth * 0.95);
  logger.info("bitcoin worth updated: $" + items["bitcoin"].buy.toLocaleString());

  res = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=ETH").then((res) =>
    res.json(),
  );

  const ethWorth = Math.floor(res.data.rates.USD);

  if (!ethWorth) {
    logger.error("INVALID ETH WORTH");
    return logger.error("eth error", res);
  }

  if (ethWorth > 1_000_000) {
    logger.error("FATAL - something wrong with btc");
    return;
  }

  items["ethereum"].buy = ethWorth;
  items["ethereum"].sell = Math.floor(ethWorth * 0.95);
  logger.info("ethereum worth updated: $" + items["ethereum"].buy.toLocaleString());
}

export function getBaseWorkers() {
  return baseWorkers;
}

export function getBaseUpgrades() {
  return baseUpgrades;
}

export function getGuildUpgradeData() {
  return guildUpgrades;
}

export function runEconomySetup() {
  setInterval(updateCryptoWorth, 1500000);

  loadItems();
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
    return (await redis.get(`${Constants.redis.cache.economy.EXISTS}:${id}`)) === "true"
      ? true
      : false;
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
    await redis.expire(`${Constants.redis.cache.economy.EXISTS}:${id}`, ms("12 hour") / 1000);
    return true;
  } else {
    await redis.set(`${Constants.redis.cache.economy.EXISTS}:${id}`, "false");
    await redis.expire(`${Constants.redis.cache.economy.EXISTS}:${id}`, ms("12 hour") / 1000);
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

  if (!id) return;

  if (await redis.exists(`${Constants.redis.nypsi.PROFILE_TRANSFER}:${id}`)) return;

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

  bet = bet.toString().toLowerCase();

  if (bet == "all") {
    bet = await getBalance(member);
    if (bet > maxBet) {
      bet = maxBet;
    }
  } else if (bet == "max") {
    bet = maxBet;
  } else if (bet == "half") {
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

export function formatNumber(number: string | number) {
  number = number.toString().toLowerCase().replaceAll(",", "");
  if (number.includes("b")) {
    number = parseFloat(number.toString()) * 1000000000;
  } else if (number.includes("m")) {
    number = parseFloat(number.toString()) * 1000000;
  } else if (number.includes("k")) {
    number = parseFloat(number.toString()) * 1000;
  }

  if (isNaN(parseFloat(number.toString()))) return null;

  return Math.floor(parseFloat(number.toString()));
}

export async function isEcoBanned(id: string) {
  if (await isUserBlacklisted(id)) return true;

  const cache = await redis.get(`${Constants.redis.cache.economy.BANNED}:${id}`);

  if (cache) {
    const res = cache === "t" ? true : false;

    return res;
  }

  const accounts = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, id);

  for (const accountId of accounts) {
    const cache = await redis.get(`${Constants.redis.cache.economy.BANNED}:${accountId}`);
    if (cache === "t") {
      return true;
    } else {
      const query = await prisma.economy.findUnique({
        where: { userId: accountId },
        select: { banned: true },
      });

      if (query && query.banned) {
        if (query.banned.getTime() > Date.now()) {
          for (const accountId of accounts) {
            await redis.set(
              `${Constants.redis.cache.economy.BANNED}:${accountId}`,
              "t",
              "EX",
              ms("3 hour") / 1000,
            );
          }

          return true;
        } else {
          await redis.set(`${Constants.redis.cache.economy.BANNED}:${accountId}`, "f", "EX", 3600);
        }
      } else {
        await redis.set(`${Constants.redis.cache.economy.BANNED}:${accountId}`, "f", "EX", 3600);
      }
    }
  }

  return false;
}

export async function getEcoBanTime(id: string) {
  const accounts = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, id);

  for (const accountId of accounts) {
    const query = await prisma.economy.findUnique({
      where: { userId: accountId },
      select: { banned: true },
    });

    if (query && query.banned && query.banned.getTime() > Date.now()) {
      return query.banned;
    }
  }
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

  exec(`redis-cli KEYS "*economy:banned*" | xargs redis-cli DEL`);
}

export async function reset() {
  await prisma.lotteryTicket.deleteMany();
  await prisma.$executeRaw`ALTER SEQUENCE "LotteryTicket_id_seq" RESTART WITH 1;`;
  await prisma.booster.deleteMany();
  await prisma.game.deleteMany();
  await prisma.$executeRaw`TRUNCATE TABLE "Game" RESTART IDENTITY;`;
  await prisma.stats.deleteMany();
  await prisma.economyGuildMember.deleteMany();
  await prisma.economyGuild.deleteMany();
  await prisma.auction.deleteMany({ where: { sold: false } });
  await prisma.offer.deleteMany({ where: { sold: false } });
  await prisma.economyWorkerUpgrades.deleteMany();
  await prisma.economyWorker.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.crafting.deleteMany();
  await prisma.bakeryUpgrade.deleteMany();
  await prisma.graphMetrics.deleteMany({
    where: {
      OR: [{ category: "networth" }, { category: "balance" }, { category: { contains: "guild" } }],
    },
  });

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
        level: user.level - (user.level % 100),
        seasonVote: 0,
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
    logger.warn("refetching items");
    const itemsFile: any = fs.readFileSync("./data/items.json");

    return JSON.parse(itemsFile);
  }

  return items;
}

export function getTagsData() {
  return tags;
}

export function getUpgradesData() {
  return userUpgrades;
}

export function getBakeryUpgradesData() {
  return bakeryUpgrades;
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

  exec(`redis-cli KEYS "*:${id}:*" | xargs redis-cli DEL`);

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
  await prisma.economy.delete({
    where: {
      userId: id,
    },
  });
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

export async function addTicket(member: GuildMember | string, amount = 1) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const data: { userId: string }[] = new Array(amount).fill({ userId: id });

  await prisma.lotteryTicket.createMany({
    data,
  });

  if (!(member instanceof GuildMember)) return;

  await redis.hincrby(
    "lotterytickets:queue",
    (await getPreferences(id)).leaderboards ? member.user.username : "[hidden]",
    amount,
  );
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

  let total = Math.floor(math.square(streak * 7) + 25_000);

  if (total > 1_000_000) total = 1_000_000;

  let xp = 1;
  let crate = 0;

  if (streak > 5) {
    xp = Math.floor((streak - 5) / 10);
  }

  if (xp > 69) xp = 69;

  const promises = [];
  const rewards: string[] = [
    `+$**${total.toLocaleString()}**`,
    `+ ${items["daily_scratch_card"].emoji} daily scratch card`,
  ];

  if (streak > 0 && streak % 7 == 0) {
    crate++;

    crate += Math.floor(math.sqrt(streak / 1.3) as number);

    if (crate > 10) crate = 10;

    promises.push(addInventoryItem(member, "basic_crate", crate));

    rewards.push(`+ **${crate.toLocaleString()}** 📦 basic crate${crate > 1 ? "s" : ""}`);
  }

  if (streak > 1 && streak % 69 == 0) {
    promises.push(addInventoryItem(member, "69420_crate", 5));

    rewards.push("+ **5** 🎁 69420 crates");
  }

  if (streak > 1 && streak % 100 == 0) {
    promises.push(addInventoryItem(member, "nypsi_crate", 1));

    rewards.push(`+ **1** ${items["nypsi_crate"].emoji} nypsi crate`);
  }

  if (streak > 1 && streak % 500 == 0) {
    promises.push(addInventoryItem(member, "gem_crate", 1));

    rewards.push(`+ **1** ${items["gem_crate"].emoji} gem crate`);
  }

  promises.push(updateBalance(member, (await getBalance(member)) + total));
  promises.push(updateLastDaily(member));
  promises.push(addInventoryItem(member, "daily_scratch_card", 1));
  addStat(member.user.id, "earned-daily", total);

  await Promise.all(promises);

  const embed = new CustomEmbed(member);
  embed.setHeader("daily", member.user.avatarURL());
  embed.setDescription(`daily streak: \`${streak}\``);

  embed.addField("rewards", rewards.join("\n"));

  if (xp > 0) {
    await updateXp(member, (await getXp(member)) + xp);
    embed.setFooter({ text: `+${xp}xp` });
  }

  await setProgress(member.id, "streaker", streak);

  return embed;
}

export async function renderGambleScreen(
  userId: string,
  state: "playing" | "win" | "lose" | "draw",
  bet: number,
  insert?: string,
  winnings?: number,
  multiplier?: number,
) {
  let output = `**bet** $${bet.toLocaleString()}${insert ? `\n${insert}` : ""}`;
  if (state === "playing") return output;
  if (state === "lose") output += "\n\n**you lose!!**";
  if (state === "win")
    output += `\n\n**winner!!!**\n**you win** $${winnings.toLocaleString()}${
      multiplier ? `\n+**${Math.floor(multiplier * 100).toString()}%** bonus` : ""
    }`;
  if (state === "draw") output += `\n\n**draw!!**\n**you win** $${bet.toLocaleString()}`;

  return output;
}
