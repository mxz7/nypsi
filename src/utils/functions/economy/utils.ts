import { GuildMember } from "discord.js";
import * as fs from "fs";
import fetch from "node-fetch";
import prisma from "../../database/database";
import redis from "../../database/redis";
import { logger } from "../../logger";
import { AchievementData, Item } from "../../models/Economy";
import { calcMaxBet, getBalance } from "./balance";
import { getGuildByUser } from "./guilds";
import ms = require("ms");
import dayjs = require("dayjs");
import { createProfile, hasProfile } from "../users/utils";

let items: { [key: string]: Item };
let achievements: { [key: string]: AchievementData };

const lotteryTicketPrice = 15000;
/**
 * higher ticket price = more favourable to rich people cus poor people cant buy tickets resulting in less tickets overall
 * the goal is to have more tickets overall for a more random outcome
 */
export { lotteryTicketPrice };

export function loadItems() {
  const itemsFile: any = fs.readFileSync("./data/items.json");
  const achievementsFile: any = fs.readFileSync("./data/achievements.json");

  items = JSON.parse(itemsFile);
  achievements = JSON.parse(achievementsFile);

  logger.info(`${Array.from(Object.keys(items)).length.toLocaleString()} economy items loaded`);
  logger.info(`${Object.keys(achievements).length.toLocaleString()} achievements loaded`);

  setTimeout(() => {
    updateCryptoWorth();
  }, 50);
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

  if (await redis.exists(`cache:economy:exists:${id}`)) {
    return (await redis.get(`cache:economy:exists:${id}`)) === "true" ? true : false;
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
    await redis.set(`cache:economy:exists:${id}`, "true");
    await redis.expire(`cache:economy:exists:${id}`, ms("1 hour") / 1000);
    return true;
  } else {
    await redis.set(`cache:economy:exists:${id}`, "false");
    await redis.expire(`cache:economy:exists:${id}`, ms("1 hour") / 1000);
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
  await redis.del(`cache:economy:exists:${id}`);
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

export async function getDMsEnabled(member: GuildMember | string): Promise<boolean> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (!(await userExists(id))) await createUser(id);

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      dms: true,
    },
  });

  return query.dms;
}

export async function setDMsEnabled(member: GuildMember, value: boolean) {
  await prisma.economy.update({
    where: {
      userId: member.user.id,
    },
    data: {
      dms: value,
    },
  });
}

export async function isEcoBanned(id: string) {
  if (await redis.exists(`cache:economy:banned:${id}`)) {
    const res = (await redis.get(`cache:economy:banned:${id}`)) === "t" ? true : false;

    if (res) await redis.del(`cache:economy:banned:${id}`);
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
      await redis.set(`cache:economy:banned:${id}`, "f");
      await redis.expire(`cache:economy:banned:${id}`, ms("1 hour") / 1000);
      return false;
    }

    if (dayjs().isBefore(query.banned)) {
      await redis.set(`cache:economy:banned:${id}`, "t");
      await redis.expire(`cache:economy:banned:${id}`, ms("1 hour") / 1000);
      return true;
    } else {
      await redis.set(`cache:economy:banned:${id}`, "f");
      await redis.expire(`cache:economy:banned:${id}`, ms("1 hour") / 1000);
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

  await redis.del(`cache:economy:banned:${id}`);
}

export async function reset() {
  await prisma.lotteryTicket.deleteMany();
  await prisma.$executeRaw`ALTER SEQUENCE "LotteryTicket_id_seq" RESTART WITH 1;`;
  await prisma.booster.deleteMany();
  await prisma.economyStats.deleteMany();
  await prisma.economyGuildMember.deleteMany();
  await prisma.economyGuild.deleteMany();
  await prisma.auction.deleteMany();

  await prisma.economy.deleteMany({
    where: {
      banned: { gt: new Date() },
    },
  });

  const deleted = await prisma.economy
    .deleteMany({
      where: {
        AND: [{ prestige: 0 }, { lastVote: { lt: new Date(Date.now() - ms("12 hours")) } }, { dms: true }],
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
        inventory: {},
        workers: {},
      },
    });

    updated++;

    await redis.del(`cache:economy:exists:${user.userId}`);
    await redis.del(`cache:economy:banned:${user.userId}`);
    await redis.del(`cache:economy:prestige:${user.userId}`);
    await redis.del(`cache:economy:exists:${user.userId}`);
    await redis.del(`cache:economy:xp:${user.userId}`);
    await redis.del(`cache:economy:balance:${user.userId}`);
    await redis.del(`cache:economy:boosters:${user.userId}`);
    await redis.del(`economy:handcuffed:${user.userId}`);
    await redis.del(`cache:economy:guild:user:${user.userId}`);
  }

  return updated + deleted;
}

export function getItems(): { [key: string]: Item } {
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

  await redis.del(`cache:economy:exists:${id}`);
  await redis.del(`cache:economy:banned:${id}`);
  await redis.del(`cache:economy:prestige:${id}`);
  await redis.del(`cache:economy:exists:${id}`);
  await redis.del(`cache:economy:xp:${id}`);
  await redis.del(`cache:economy:balance:${id}`);
  await redis.del(`cache:economy:boosters:${id}`);
  await redis.del(`cache:economy:guild:user:${id}`);
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

export async function startOpeningCrates(member: GuildMember) {
  await redis.set(`economy:crates:block:${member.user.id}`, "y");
}

export async function stopOpeningCrates(member: GuildMember) {
  await redis.del(`economy:crates:block:${member.user.id}`);
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
