import ms = require("ms");
import { PunishmentType } from "#generated/prisma";
import prisma from "../../../init/database";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { getAllGroupAccountIds } from "../moderation/alts";

type Blacklisted = {
  blacklisted: boolean;
  relation?: string;
};

const blacklistCache = new RedisCache<Blacklisted>(
  Constants.redis.cache.user.BLACKLIST,
  ms("3 hour") / 1000,
);

export async function isUserBlacklisted(member: MemberResolvable): Promise<Blacklisted> {
  const userId = getUserId(member);
  const cached = await blacklistCache.get(userId);
  if (cached) return cached;

  const accounts = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, userId);

  for (const accountId of accounts) {
    const cached = await blacklistCache.get(accountId);

    if (cached) {
      if (cached.blacklisted) return cached;
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
          await blacklistCache.set(accountId2, { blacklisted: true, relation: accountId });
        }

        return { blacklisted: true, relation: accountId };
      }
    }
  }

  for (const id of accounts) await blacklistCache.set(id, { blacklisted: false });

  return { blacklisted: false };
}
