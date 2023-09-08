import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import ms = require("ms");

const levelFormula = (level: number, prestige: number) =>
  Math.floor(Math.pow(level, 2 + 0.07 * prestige) + 100);
const moneyFormula = (level: number, prestige: number) =>
  Math.floor(Math.pow(level, 3.7 + 0.07 * prestige) + 25_000);

export async function getPrestige(member: GuildMember | string): Promise<number> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.economy.PRESTIGE}:${id}`)) {
    return parseInt(await redis.get(`${Constants.redis.cache.economy.PRESTIGE}:${id}`));
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      prestige: true,
    },
  });

  await redis.set(`${Constants.redis.cache.economy.PRESTIGE}:${id}`, query.prestige);
  await redis.expire(`${Constants.redis.cache.economy.PRESTIGE}:${id}`, ms("1 hour") / 1000);

  return query.prestige;
}

export async function setPrestige(member: GuildMember | string, amount: number) {
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
      prestige: amount,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.PRESTIGE}:${id}`);
}

export async function getLevel(member: GuildMember | string): Promise<number> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.economy.LEVEL}:${id}`)) {
    return parseInt(await redis.get(`${Constants.redis.cache.economy.LEVEL}:${id}`));
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      level: true,
    },
  });

  await redis.set(`${Constants.redis.cache.economy.LEVEL}:${id}`, query.level);
  await redis.expire(`${Constants.redis.cache.economy.LEVEL}:${id}`, ms("1 hour") / 1000);

  return query.level;
}

export async function setLevel(member: GuildMember | string, amount: number) {
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
      level: amount,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.LEVEL}:${id}`);
}

export async function getLevelRequirements(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  let [prestige, level] = await Promise.all([getPrestige(id), getLevel(id)]);

  while (level > 100) {
    prestige++;
    level -= 100;
  }

  const requiredXp = levelFormula(level, prestige);
  const requiredMoney = moneyFormula(level, prestige);

  return { xp: requiredXp, money: requiredMoney };
}
