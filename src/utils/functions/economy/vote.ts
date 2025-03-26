import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import ms = require("ms");

export async function getLastVote(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      lastVote: true,
    },
  });

  return query.lastVote;
}

export async function hasVoted(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.economy.VOTE}:${id}`)) {
    const res = parseInt(await redis.get(`${Constants.redis.cache.economy.VOTE}:${id}`));

    if (Date.now() - res < ms("12 hours")) {
      return true;
    } else {
      return false;
    }
  }

  const lastVote = await getLastVote(id);

  if (Date.now() - lastVote.getTime() < ms("12 hours")) {
    redis.set(`${Constants.redis.cache.economy.VOTE}:${id}`, lastVote.getTime());
    redis.expire(`${Constants.redis.cache.economy.VOTE}:${id}`, ms("30 minutes") / 1000);
    return true;
  } else {
    redis.set(`${Constants.redis.cache.economy.VOTE}:${id}`, lastVote.getTime());
    redis.expire(`${Constants.redis.cache.economy.VOTE}:${id}`, ms("1 hour") / 1000);
    return false;
  }
}

export async function getVoteStreak(userId: string) {
  const query = await prisma.economy.findUnique({
    where: {
      userId,
    },
    select: {
      voteStreak: true,
    },
  });

  return query?.voteStreak || 0;
}
