import { UserAlias } from "@prisma/client";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { isPremium } from "./premium";
import ms = require("ms");

export async function getUserAliases(member: MemberResolvable) {
  const userId = getUserId(member);

  if (await redis.exists(`${Constants.redis.cache.premium.ALIASES}:${userId}`)) {
    return JSON.parse(
      await redis.get(`${Constants.redis.cache.premium.ALIASES}:${userId}`),
    ) as UserAlias[];
  }

  const query = (await isPremium(userId))
    ? await prisma.userAlias.findMany({
        where: {
          userId,
        },
      })
    : [];

  await redis.set(
    `${Constants.redis.cache.premium.ALIASES}:${userId}`,
    JSON.stringify(query || []),
    "EX",
    ms("12 hour") / 1000,
  );

  return query;
}

export async function addUserAlias(member: MemberResolvable, alias: string, command: string) {
  const userId = getUserId(member);

  await prisma.userAlias.create({
    data: {
      alias,
      command,
      userId,
    },
  });

  await redis.del(`${Constants.redis.cache.premium.ALIASES}:${userId}`);
}

export async function removeUserAlias(member: MemberResolvable, alias: string) {
  const userId = getUserId(member);

  await prisma.userAlias.delete({
    where: {
      userId_alias: {
        alias,
        userId,
      },
    },
  });

  await redis.del(`${Constants.redis.cache.premium.ALIASES}:${userId}`);
}
