import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";

export async function updateLastKnownUsername(member: MemberResolvable, tag: string) {
  const userId = getUserId(member);

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      lastKnownUsername: tag,
    },
  });

  await redis.set(`${Constants.redis.cache.user.username}:${userId}`, tag, "EX", 7200);
}

export async function getLastKnownUsername(id: string, escapeSpecialCharacters = true) {
  const cache = await redis.get(`${Constants.redis.cache.user.username}:${id}`);

  if (cache) return escapeSpecialCharacters ? cache.replaceAll('_', '\\_') : cache;

  const query = await prisma.user.findUnique({
    where: {
      id: id,
    },
    select: {
      lastKnownUsername: true,
    },
  });

  await redis.set(
    `${Constants.redis.cache.user.username}:${id}`,
    query?.lastKnownUsername || "",
    "EX",
    7200,
  );

  return escapeSpecialCharacters ? query?.lastKnownUsername.replaceAll('_', '\\_') : query?.lastKnownUsername;
}

export async function getIdFromUsername(username: string) {
  const query = await prisma.user.findFirst({
    where: { lastKnownUsername: username },
    select: {
      id: true,
    },
  });

  return query?.id;
}

export async function getLastKnownAvatar(id: string) {
  const cache = await redis.get(`${Constants.redis.cache.user.avatar}:${id}`);

  if (cache) {
    return cache;
  }

  const query = await prisma.user.findUnique({
    where: {
      id: id,
    },
    select: {
      avatar: true,
    },
  });

  await redis.set(`${Constants.redis.cache.user.avatar}:${id}`, query.avatar, "EX", 86400);

  return query.avatar;
}
