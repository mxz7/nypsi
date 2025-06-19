import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";

const base = 1000;

export async function getAura(member: MemberResolvable) {
  const userId = getUserId(member);

  const cache = await redis.get(`${Constants.redis.cache.user.aura}:${userId}`);

  if (cache) return parseInt(cache);

  const received = await prisma.aura.aggregate({
    where: { recipientId: userId },
    _sum: { amount: true },
  });
  const sent = await prisma.aura.aggregate({
    where: { senderId: userId },
    _sum: { amount: true },
  });

  const total = base + (received._sum.amount - sent._sum.amount);

  await redis.set(`${Constants.redis.cache.user.aura}:${userId}`, total);

  return total;
}

export async function createAuraTransaction(
  recipient: MemberResolvable,
  sender: MemberResolvable,
  amount: number,
) {
  const senderId = getUserId(recipient);
  const recipientId = getUserId(sender);

  await prisma.aura.create({
    data: { senderId, recipientId, amount },
  });
  await redis.del(
    `${Constants.redis.cache.user.aura}:${recipientId}`,
    `${Constants.redis.cache.user.aura}:${senderId}`,
  );
}

export async function getAuraTransactions(member: MemberResolvable) {
  const userId = getUserId(member);

  const query = await prisma.aura.findMany({
    where: { OR: [{ recipientId: userId }, { senderId: userId }] },
    orderBy: { createdAt: "asc" },
  });

  return query;
}
