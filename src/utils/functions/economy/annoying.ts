import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import ms = require("ms");

export async function isAnnoying(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const cache = await redis.get(`${Constants.redis.cache.economy.ANNOYING}:${id}`);

  if (cache) {
    return cache == "t";
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      annoying: true,
    },
  });

  await redis.set(`${Constants.redis.cache.economy.ANNOYING}:${id}`, query.annoying ? "t" : "f");
  await redis.expire(
    `${Constants.redis.cache.economy.ANNOYING}:${id}`,
    Math.floor(ms("6 hours") / 1000),
  );

  return query.annoying;
}

export async function setAnnoying(member: GuildMember | string, value: boolean) {
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
      annoying: value,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.ANNOYING}:${id}`);
}
