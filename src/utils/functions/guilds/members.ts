import { Prisma } from "@prisma/client";
import { Guild } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { Mutex } from "../mutex";
import ms = require("ms");

async function getDatabaseMembers(guildId: string, onlyWithProfile = false) {
  const redisKey = onlyWithProfile
    ? `${Constants.redis.cache.guild.MEMBERS_WITH_PROFILE}:${guildId}`
    : `${Constants.redis.cache.guild.MEMBERS}:${guildId}`;

  const cache = await redis.get(redisKey);

  if (cache) {
    return JSON.parse(cache) as string[];
  }

  const where: Prisma.GuildMemberWhereInput = onlyWithProfile
    ? ({ guildId, user: { NOT: null } } as const)
    : ({ guildId } as const);

  const members = await prisma.guildMember
    .findMany({ where, select: { userId: true } })
    .then((members) => members.map(({ userId }) => userId));

  await redis.set(redisKey, JSON.stringify(members), "EX", ms("30 minute") / 1000);
}

async function checkMembers(guildId: string, discordMembers: string[]) {
  const databaseMembers = await getDatabaseMembers(guildId);

  const dbSet = new Set(databaseMembers);
  const discordSet = new Set(discordMembers);

  const missing = [...new Set(discordMembers.filter((x) => !dbSet.has(x)))];
  const extra = [...new Set(databaseMembers.filter((x) => !discordSet.has(x)))];

  if (missing.length > 0) {
    await prisma.guildMember.createMany({
      data: missing.map((userId) => ({ guildId, userId })),
    });
    redis.del(
      `${Constants.redis.cache.guild.MEMBERS}:${guildId}`,
      `${Constants.redis.cache.guild.MEMBERS_WITH_PROFILE}:${guildId}`,
    );
  }

  if (extra.length > 0) {
    await prisma.guildMember.deleteMany({ where: { guildId, userId: { in: extra } } });
    redis.del(
      `${Constants.redis.cache.guild.MEMBERS}:${guildId}`,
      `${Constants.redis.cache.guild.MEMBERS_WITH_PROFILE}:${guildId}`,
    );
  }
}

const mutex = new Mutex();

export async function getAllMembers(guild: Guild) {
  await mutex.acquire(`member_fetch_${guild.id}`);
  try {
    const lastFetched = await redis
      .get(`${Constants.redis.cache.guild.MEMBERS_LAST_FETCHED}:${guild.id}`)
      .then((v) => (v ? parseInt(v) : 0));

    if (lastFetched > Date.now() - ms("10 minute")) {
      return getDatabaseMembers(guild.id);
    }

    let discordMembers: string[];

    if (guild.memberCount === guild.members.cache.size) {
      discordMembers = guild.members.cache.map((member) => member.id);
    } else {
      discordMembers = await guild.members
        .fetch()
        .then((members) => members.map((member) => member.id));
    }

    await redis.set(
      `${Constants.redis.cache.guild.MEMBERS_LAST_FETCHED}:${guild.id}`,
      Date.now(),
      "EX",
      ms("10 minute") / 1000,
    );

    checkMembers(guild.id, discordMembers);

    return discordMembers;
  } finally {
    mutex.release(`member_fetch_${guild.id}`);
  }
}
