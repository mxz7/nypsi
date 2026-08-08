import { Marriage } from "#generated/prisma";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { addProgress } from "../economy/achievements";
import { getUserId, MemberResolvable } from "../member";
import { RedisMutex } from "../mutex";

const marriageCache = new RedisCache<false | Marriage>(Constants.redis.cache.user.MARRIED, 86400);
const marriageMutex = new RedisMutex("marriage");

export async function isMarried(member: MemberResolvable): Promise<false | Marriage> {
  const userId = getUserId(member);

  const cached = await marriageCache.get(userId);
  if (cached !== null) return cached;

  const res = await prisma.marriage.findFirst({
    where: {
      userId,
    },
  });

  if (res && !(await prisma.user.findFirst({ where: { id: res.partnerId } }))) {
    await removeMarriage(member);
    return false;
  }

  await marriageCache.set(userId, res || false);

  return res || false;
}

export async function addMarriage(userId: string, targetId: string): Promise<boolean> {
  await marriageMutex.acquire();

  try {
    const existingMarriage = await prisma.marriage.findFirst({
      where: {
        OR: [
          { userId },
          { partnerId: userId },
          { userId: targetId },
          { partnerId: targetId },
        ],
      },
    });

    if (existingMarriage) return false;

    await prisma.$transaction(async (prisma) => {
      await prisma.marriage.create({ data: { userId: userId, partnerId: targetId } });
      await prisma.marriage.create({ data: { userId: targetId, partnerId: userId } });
    });
    await Promise.all([marriageCache.delete(userId), marriageCache.delete(targetId)]);

    await redis.set(`${Constants.redis.cache.user.LAST_MARRIED}:${userId}`, targetId, "EX", 60);
    await redis.set(`${Constants.redis.cache.user.LAST_MARRIED}:${targetId}`, userId, "EX", 60);

    addProgress(userId, "top_shagger", 1);
    addProgress(targetId, "top_shagger", 1);

    return true;
  } finally {
    marriageMutex.release();
  }
}

export async function removeMarriage(member: MemberResolvable): Promise<false | Marriage> {
  const userId = getUserId(member);

  await marriageMutex.acquire();

  try {
    const marriage = await prisma.marriage.findFirst({ where: { userId } });

    if (!marriage) return false;

    await prisma.marriage.deleteMany({
      where: {
        OR: [{ userId }, { partnerId: userId }],
      },
    });
    await Promise.all([marriageCache.delete(marriage.userId), marriageCache.delete(marriage.partnerId)]);

    return marriage;
  } finally {
    marriageMutex.release();
  }
}
