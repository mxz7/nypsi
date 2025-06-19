import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import ms = require("ms");

export async function isPassive(member: MemberResolvable) {
  const userId = getUserId(member);

  const cache = await redis.get(`${Constants.redis.cache.economy.PASSIVE}:${userId}`);

  if (cache) {
    return cache == "t";
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId,
    },
    select: {
      passive: true,
    },
  });

  await redis.set(
    `${Constants.redis.cache.economy.PASSIVE}:${userId}`,
    query.passive ? "t" : "f",
    "EX",
    ms("24 hours") / 1000,
  );

  return query.passive;
}

export async function setPassive(member: MemberResolvable, value: boolean) {
  const userId = getUserId(member);

  await prisma.economy.update({
    where: {
      userId,
    },
    data: {
      passive: value,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.PASSIVE}:${userId}`);
}
