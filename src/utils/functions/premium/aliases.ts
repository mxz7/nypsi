import { UserAlias } from "#generated/prisma";
import prisma from "../../../init/database";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { isPremium } from "./premium";
import ms = require("ms");

const aliasesCache = new RedisCache<UserAlias[]>(
  Constants.redis.cache.premium.ALIASES,
  ms("12 hour") / 1000,
);

export async function getUserAliases(member: MemberResolvable) {
  const userId = getUserId(member);

  const cached = await aliasesCache.get(userId);
  if (cached) return cached;

  const query = (await isPremium(userId))
    ? await prisma.userAlias.findMany({
        where: {
          userId,
        },
      })
    : [];

  await aliasesCache.set(userId, query || []);

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

  await aliasesCache.delete(userId);
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

  await aliasesCache.delete(userId);
}
