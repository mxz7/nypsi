import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { cleanString } from "../string";
import ms = require("ms");

export async function getLastfmUsername(member: MemberResolvable) {
  const userId = getUserId(member);

  if (await redis.exists(`${Constants.redis.cache.user.LASTFM}:${userId}`)) {
    return await redis.get(`${Constants.redis.cache.user.LASTFM}:${userId}`);
  } else {
    const query = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        lastfmUsername: true,
      },
    });

    if (query && query.lastfmUsername) {
      await redis.set(
        `${Constants.redis.cache.user.LASTFM}:${userId}`,
        query.lastfmUsername,
        "EX",
        ms("1 hour") / 1000,
      );
      return query.lastfmUsername;
    } else {
      return undefined;
    }
  }
}

export async function setLastfmUsername(member: MemberResolvable, username: string) {
  const userId = getUserId(member);

  username = cleanString(username);

  const res = await fetch(
    `https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${username}&api_key=${process.env.LASTFM_TOKEN}&format=json`,
  ).then((res) => res.json());

  if (res.error && res.error == 6) return false;

  await redis.del(`${Constants.redis.cache.user.LASTFM}:${userId}`);

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
