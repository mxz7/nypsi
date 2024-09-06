import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";

const base = 1000;

export async function getAura(userId: string) {
  const cache = await redis.get(`${Constants.redis.cache.user.aura}:${userId}`);

  if (cache) return parseInt(cache);

  const query = await prisma.aura.aggregate({
    where: { OR: [{ recipientId: userId }, { senderId: userId }] },
    _sum: { amount: true },
  });

  await redis.set(`${Constants.redis.cache.user.aura}:${userId}`, base + query._sum.amount);

  return base + query._sum.amount;
}

export async function createAuraTransaction(recipientId: string, senderId: string, amount: number) {
  await prisma.aura.create({
    data: { senderId, recipientId, amount },
  });
  await redis.del(
    `${Constants.redis.cache.user.aura}:${recipientId}`,
    `${Constants.redis.cache.user.aura}:${senderId}`,
  );
}

export async function getAuraTransactions(userId: string) {
  const query = await prisma.aura.findMany({
    where: { OR: [{ recipientId: userId }, { senderId: userId }] },
    orderBy: { createdAt: "desc" },
  });

  return query;
}
