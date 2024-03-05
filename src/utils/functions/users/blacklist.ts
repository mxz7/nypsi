import ms = require("ms");
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";

export async function isUserBlacklisted(id: string) {
  const cache = await redis.get(`${Constants.redis.cache.user.BLACKLIST}:${id}`);

  if (cache) {
    return cache === "t";
  }

  const query = await prisma.user.findUnique({
    where: {
      id,
    },
    select: {
      blacklisted: true,
    },
  });

  if (!query || !query.blacklisted) {
    await redis.set(`${Constants.redis.cache.user.BLACKLIST}:${id}`, "f");
    await redis.expire(`${Constants.redis.cache.user.BLACKLIST}:${id}`, ms("7 day") / 1000);
    return false;
  } else {
    await redis.set(`${Constants.redis.cache.user.BLACKLIST}:${id}`, "t");
    await redis.expire(`${Constants.redis.cache.user.BLACKLIST}:${id}`, ms("7 day") / 1000);
    return true;
  }
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

  await redis.del(`${Constants.redis.cache.user.BLACKLIST}:${id}`);
}
