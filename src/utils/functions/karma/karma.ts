import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { createProfile } from "../users/utils";

const karmaCache = new RedisCache<number>(Constants.redis.cache.user.KARMA, 86400);

export async function getKarma(member: MemberResolvable): Promise<number> {
  const userId = getUserId(member);

  const cached = await karmaCache.get(userId);
  if (cached !== null) return cached;

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
    await karmaCache.set(userId, query.karma);
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

  await karmaCache.delete(userId);
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

  await karmaCache.delete(userId);
}
