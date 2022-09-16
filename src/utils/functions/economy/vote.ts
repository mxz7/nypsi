import { GuildMember } from "discord.js";
import prisma from "../../database/database";
import redis from "../../database/redis";
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

  if (await redis.exists(`cache:vote:${id}`)) {
    const res = parseInt(await redis.get(`cache:vote:${id}`));

    if (Date.now() - res < ms("12 hours")) {
      return true;
    } else {
      return false;
    }
  }

  const lastVote = await getLastVote(id);

  if (Date.now() - lastVote.getTime() < ms("12 hours")) {
    redis.set(`cache:vote:${id}`, lastVote.getTime());
    redis.expire(`cache:vote:${id}`, ms("30 minutes") / 1000);
    return true;
  } else {
    redis.set(`cache:vote:${id}`, lastVote.getTime());
    redis.expire(`cache:vote:${id}`, ms("1 hour") / 1000);
    return false;
  }
}
