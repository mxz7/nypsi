import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { escapeFormattingCharacters } from "../string";

export async function updateLastKnownUsername(member: MemberResolvable, tag: string) {
  const userId = getUserId(member);

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      lastKnownUsername: tag,
      usernameUpdatedAt: new Date(),
    },
  });

  await redis.set(`${Constants.redis.cache.user.username}:${userId}`, tag, "EX", 7200);
}

export async function getLastKnownUsername(
  id: string,
  escape?: boolean,
  showUpdatedAt?: false,
): Promise<string>;
export async function getLastKnownUsername(
  id: string,
  escape?: boolean,
  showUpdatedAt?: true,
): Promise<{ lastKnownUsername: string; usernameUpdatedAt: Date }>;
export async function getLastKnownUsername(
  id: string,
  escape = true,
  showUpdatedAt?: boolean,
): Promise<string | { lastKnownUsername: string; usernameUpdatedAt: Date }> {
  const cache = await redis.get(`${Constants.redis.cache.user.username}:${id}`);

  if (cache) {
    const data: {
      lastKnownUsername: string;
      usernameUpdatedAt: Date;
    } = JSON.parse(cache);

    data.usernameUpdatedAt = new Date(data.usernameUpdatedAt);

    if (escape) {
      data.lastKnownUsername = escapeFormattingCharacters(data.lastKnownUsername);
    }

    if (showUpdatedAt) {
      return data;
    }

    return data.lastKnownUsername;
  }

  const query = await prisma.user.findUnique({
    where: {
      id: id,
    },
    select: {
      lastKnownUsername: true,
      usernameUpdatedAt: true,
    },
  });

  await redis.set(
    `${Constants.redis.cache.user.username}:${id}`,
    JSON.stringify(query ? query : { lastKnownUsername: "unknown", usernameUpdatedAt: new Date() }),
    "EX",
    7200,
  );

  if (!query) return "unknown";

  if (escape) {
    query.lastKnownUsername = escapeFormattingCharacters(query.lastKnownUsername);
  }

  if (showUpdatedAt) {
    return query;
  }

  return query.lastKnownUsername;
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
