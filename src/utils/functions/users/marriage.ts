import { Marriage } from "@prisma/client";
import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";

export async function isMarried(member: GuildMember | string): Promise<false | Marriage> {
  let userId: string;
  if (member instanceof GuildMember) {
    userId = member.user.id;
  } else {
    userId = member;
  }

  const cache = await redis.get(`${Constants.redis.cache.user.MARRIED}:${userId}`);

  if (cache) {
    return JSON.parse(cache);
  }

  const res = await prisma.marriage.findFirst({
    where: {
      userId,
    },
  });

  if (res && !(await prisma.user.findFirst({ where: { id: res.partnerId } }))) {
    await removeMarriage(member);
    return false;
  }

  await redis.set(
    `${Constants.redis.cache.user.MARRIED}:${userId}`,
    JSON.stringify(res),
    "EX",
    86400,
  );

  return res || false;
}

export async function addMarriage(userId: string, targetId: string) {
  await prisma.$transaction(async (prisma) => {
    await prisma.marriage.create({ data: { userId: userId, partnerId: targetId } });
    await prisma.marriage.create({ data: { userId: targetId, partnerId: userId } });
  });
  await redis.del(
    `${Constants.redis.cache.user.MARRIED}:${userId}`,
    `${Constants.redis.cache.user.MARRIED}:${targetId}`,
  );
}

export async function removeMarriage(member: GuildMember | string) {
  let userId: string;
  if (member instanceof GuildMember) {
    userId = member.user.id;
  } else {
    userId = member;
  }

  const res = await prisma.marriage.findFirst({
    where: {
      userId,
    },
  });

  if (res) {
    await redis.del(`${Constants.redis.cache.user.MARRIED}:${res.userId}`);
    await redis.del(`${Constants.redis.cache.user.MARRIED}:${res.partnerId}`);
  }

  await prisma.marriage.deleteMany({
    where: {
      OR: [{ userId }, { partnerId: userId }],
    },
  });
}
