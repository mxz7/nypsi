import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import ms = require("ms");

export async function isPassive(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const cache = await redis.get(`${Constants.redis.cache.economy.PASSIVE}:${id}`);

  if (cache) {
    return cache == "t";
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      passive: true,
    },
  });

  await redis.set(
    `${Constants.redis.cache.economy.PASSIVE}:${id}`,
    query.passive ? "t" : "f",
    "EX",
    ms("24 hours") / 1000,
  );

  return query.passive;
}

export async function setPassive(member: GuildMember | string, value: boolean) {
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
      passive: value,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.PASSIVE}:${id}`);
}
