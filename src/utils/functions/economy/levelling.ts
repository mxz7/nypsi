import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import ms = require("ms");

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

export async function getPrestigeRequirement(member: GuildMember): Promise<number> {
  const constant = 500;
  const extra = (await getPrestige(member)) * constant;

  return 500 + extra;
}

export function getPrestigeRequirementBal(xp: number): number {
  const constant = 750;
  const bonus = xp * constant;

  return bonus;
}
