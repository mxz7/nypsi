import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import ms = require("ms");

export async function getLastVote(member: MemberResolvable) {
  const query = await prisma.economy.findUnique({
    where: {
      userId: getUserId(member),
    },
    select: {
      lastVote: true,
    },
  });

  return query.lastVote;
}

export async function hasVoted(member: MemberResolvable) {
  const userId = getUserId(member);

  if (await redis.exists(`${Constants.redis.cache.economy.VOTE}:${userId}`)) {
    const res = parseInt(await redis.get(`${Constants.redis.cache.economy.VOTE}:${userId}`));

    if (Date.now() - res < ms("12 hours")) {
      return true;
    } else {
      return false;
    }
  }

  const lastVote = await getLastVote(userId);

  if (Date.now() - lastVote.getTime() < ms("12 hours")) {
    redis.set(
      `${Constants.redis.cache.economy.VOTE}:${userId}`,
      lastVote.getTime(),
      "EX",
      ms("1 hour") / 1000,
    );
    return true;
  } else {
    redis.set(
      `${Constants.redis.cache.economy.VOTE}:${userId}`,
      lastVote.getTime(),
      "EX",
      ms("1 hour") / 1000,
    );
    return false;
  }
}

export async function getVoteStreak(member: MemberResolvable) {
  const query = await prisma.economy.findUnique({
    where: {
      userId: getUserId(member),
    },
    select: {
      voteStreak: true,
    },
  });

  return query?.voteStreak || 0;
}
