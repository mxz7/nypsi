import prisma from "../../../init/database";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { cleanString } from "../string";
import ms = require("ms");

const lastfmCache = new RedisCache<string>(Constants.redis.cache.user.LASTFM, ms("1 hour") / 1000);

export async function getLastfmUsername(member: MemberResolvable) {
  const userId = getUserId(member);

  const cached = await lastfmCache.get(userId);
  if (cached) return cached;

  const query = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      lastfmUsername: true,
    },
  });

  if (!query?.lastfmUsername) return undefined;

  await lastfmCache.set(userId, query.lastfmUsername);
  return query.lastfmUsername;
}

export async function setLastfmUsername(member: MemberResolvable, username: string) {
  const userId = getUserId(member);

  username = cleanString(username);

  const res = await fetch(
    `https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${username}&api_key=${process.env.LASTFM_TOKEN}&format=json`,
  ).then((res) => res.json());

  if (res.error && res.error == 6) return false;

  await lastfmCache.delete(userId);

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      lastfmUsername: username,
    },
  });

  return true;
}
