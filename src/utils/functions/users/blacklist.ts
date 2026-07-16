import ms = require("ms");
import { exec } from "node:child_process";
import { PunishmentType } from "#generated/prisma";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { getAllGroupAccountIds } from "../moderation/alts";
import { PunishmentContext, setBlacklistPunishment } from "./punishments";

type Blacklisted = {
  blacklisted: boolean;
  relation?: string;
};

export async function isUserBlacklisted(member: MemberResolvable): Promise<Blacklisted> {
  const userId = getUserId(member);
  const cache = await redis.get(`${Constants.redis.cache.user.BLACKLIST}:${userId}`);

  if (cache) {
    const res = JSON.parse(cache) as Blacklisted;

    return res;
  }

  const accounts = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, userId);

  for (const accountId of accounts) {
    const cache = await redis.get(`${Constants.redis.cache.user.BLACKLIST}:${accountId}`);

    if (cache) {
      const res = JSON.parse(cache) as Blacklisted;

      if (res.blacklisted) {
        return res;
      }
    } else {
      const punishment = await prisma.punishment.findFirst({
        where: {
          userId: accountId,
          type: PunishmentType.BLACKLIST,
          endedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true },
      });

      if (punishment) {
        for (const accountId2 of accounts) {
          await redis.set(
            `${Constants.redis.cache.user.BLACKLIST}:${accountId2}`,
            JSON.stringify({
              blacklisted: true,
              relation: accountId,
            }),
            "EX",
            ms("3 hour") / 1000,
          );
        }

        return { blacklisted: true, relation: accountId };
      }
    }
  }

  for (const id of accounts)
    await redis.set(
      `${Constants.redis.cache.user.BLACKLIST}:${id}`,
      JSON.stringify({ blacklisted: false }),
      "EX",
      ms("3 hour") / 1000,
    );

  return { blacklisted: false };
}

export async function setUserBlacklist(
  member: MemberResolvable,
  value: boolean,
  context: PunishmentContext = {},
) {
  await setBlacklistPunishment(getUserId(member), value, context);

  exec(`redis-cli KEYS "*blacklist*" | xargs redis-cli DEL`);
}
