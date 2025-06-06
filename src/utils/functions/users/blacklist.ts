import ms = require("ms");
import { exec } from "node:child_process";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { getAllGroupAccountIds } from "../moderation/alts";

type Blacklisted = {
  blacklisted: boolean;
  relation?: string;
};

export async function isUserBlacklisted(id: string): Promise<Blacklisted> {
  const cache = await redis.get(`${Constants.redis.cache.user.BLACKLIST}:${id}`);

  if (cache) {
    const res = JSON.parse(cache) as Blacklisted;

    return res;
  }

  const accounts = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, id);

  for (const accountId of accounts) {
    const cache = await redis.get(`${Constants.redis.cache.user.BLACKLIST}:${accountId}`);

    if (cache) {
      const res = JSON.parse(cache) as Blacklisted;

      if (res.blacklisted) {
        return res;
      }
    } else {
      const query = await prisma.user.findUnique({
        where: { id: accountId },
        select: { blacklisted: true },
      });

      if (query && query.blacklisted) {
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

export async function setUserBlacklist(id: string, value: boolean) {
  await prisma.user.update({
    where: {
      id,
    },
    data: {
      blacklisted: value,
    },
  });

  exec(`redis-cli KEYS "*blacklist*" | xargs redis-cli DEL`);
}
