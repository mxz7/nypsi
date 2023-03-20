import ms = require("ms");
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";

export async function isBooster(userId: string) {
  if (await redis.exists(`${Constants.redis.cache.premium.BOOSTER}:${userId}`)) {
    return (await redis.get(`${Constants.redis.cache.premium.BOOSTER}:${userId}`)) === "t";
  }

  const query = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      booster: true,
    },
  });

  await redis.set(`${Constants.redis.cache.premium.BOOSTER}:${userId}`, query.booster ? "t" : "f");
  await redis.expire(`${Constants.redis.cache.premium.BOOSTER}:${userId}`, Math.floor(ms("3 hours") / 1000));

  return query.booster;
}

export async function setBooster(userId: string, value: boolean) {
  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      booster: value,
    },
  });

  await redis.del(`${Constants.redis.cache.premium.BOOSTER}:${userId}`);
}
