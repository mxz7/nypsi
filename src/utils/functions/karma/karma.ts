import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { createProfile } from "../users/utils";

export async function getKarma(member: MemberResolvable): Promise<number> {
  const userId = getUserId(member);

  if (await redis.exists(`${Constants.redis.cache.user.KARMA}:${userId}`))
    return parseInt(await redis.get(`${Constants.redis.cache.user.KARMA}:${userId}`));

  const query = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      karma: true,
    },
  });

  if (!query) {
    if (member instanceof GuildMember) {
      await createProfile(member.user);
    } else {
      await createProfile(userId);
    }
    return 1;
  } else {
    await redis.set(`${Constants.redis.cache.user.KARMA}:${userId}`, query.karma, "EX", 86400);
    return query.karma;
  }
}

export async function addKarma(member: MemberResolvable, amount: number) {
  const userId = getUserId(member);

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      karma: { increment: amount },
    },
  });

  await redis.del(`${Constants.redis.cache.user.KARMA}:${userId}`);
}

export async function removeKarma(member: MemberResolvable, amount: number) {
  const userId = getUserId(member);

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      karma: { decrement: amount },
    },
  });

  await redis.del(`${Constants.redis.cache.user.KARMA}:${userId}`);
}
