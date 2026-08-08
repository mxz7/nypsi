import prisma from "../../../init/database";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { escapeFormattingCharacters } from "../string";

type CachedUsername = {
  lastKnownUsername: string;
  usernameUpdatedAt: Date;
};

const usernameCache = new RedisCache<CachedUsername>(Constants.redis.cache.user.username, 7200);
const avatarCache = new RedisCache<string | false>(Constants.redis.cache.user.avatar, 86400);
const defaultAvatar = "https://cdn.discordapp.com/embed/avatars/0.png";

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

  await usernameCache.set(userId, { lastKnownUsername: tag, usernameUpdatedAt: new Date() });
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
  const cached = await usernameCache.get(id);

  if (cached) {
    cached.usernameUpdatedAt = new Date(cached.usernameUpdatedAt);

    if (escape) {
      cached.lastKnownUsername = escapeFormattingCharacters(cached.lastKnownUsername);
    }

    if (showUpdatedAt) {
      return cached;
    }

    return cached.lastKnownUsername;
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

  await usernameCache.set(
    id,
    query ? query : { lastKnownUsername: "unknown", usernameUpdatedAt: new Date() },
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
  const cached = await avatarCache.get(id);
  if (cached !== null) return cached || defaultAvatar;

  const query = await prisma.user.findUnique({
    where: {
      id: id,
    },
    select: {
      avatar: true,
    },
  });

  await avatarCache.set(id, query?.avatar || false);

  return query?.avatar || defaultAvatar;
}

export async function updateLastKnownAvatarCache(id: string, avatar: string) {
  await avatarCache.set(id, avatar);
}
