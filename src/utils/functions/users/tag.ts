import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";

export async function updateLastKnownUsername(member: GuildMember | string, tag: string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.user.update({
    where: {
      id: id,
    },
    data: {
      lastKnownUsername: tag,
    },
  });

  await redis.set(`${Constants.redis.cache.user.username}:${id}`, tag, "EX", 7200);
}

export async function getLastKnownUsername(id: string) {
  const cache = await redis.get(`${Constants.redis.cache.user.username}:${id}`);

  if (cache) return cache;

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

  return query?.lastKnownUsername;
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
