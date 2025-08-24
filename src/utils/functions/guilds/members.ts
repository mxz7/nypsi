import { Collection, Guild, GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { Mutex } from "../mutex";
import ms = require("ms");

async function getDatabaseMembers(guildId: string) {
  const cache = await redis.get(`${Constants.redis.cache.guild.MEMBERS}:${guildId}`);

  if (cache) {
    return JSON.parse(cache) as string[];
  }

  const members = await prisma.guildMember
    .findMany({ where: { guildId }, select: { userId: true } })
    .then((members) => members.map(({ userId }) => userId));

  await redis.set(
    `${Constants.redis.cache.guild.MEMBERS}:${guildId}`,
    JSON.stringify(members),
    "EX",
    ms("30 minute") / 1000,
  );

  return members;
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
    redis.del(`${Constants.redis.cache.guild.MEMBERS}:${guildId}`);
  }

  if (extra.length > 0) {
    await prisma.guildMember.deleteMany({ where: { guildId, userId: { in: extra } } });
    redis.del(`${Constants.redis.cache.guild.MEMBERS}:${guildId}`);
  }
}

const mutex = new Mutex();

export async function getAllMembers(
  guild: Guild,
  forceFetch: true,
): Promise<Collection<string, GuildMember>>;
export async function getAllMembers(guild: Guild, forceFetch?: false): Promise<string[]>;
export async function getAllMembers(
  guild: Guild,
  forceFetch = false,
): Promise<string[] | Collection<string, GuildMember>> {
  await mutex.acquire(`member_fetch_${guild.id}`);
  try {
    const lastFetched = await redis
      .get(`${Constants.redis.cache.guild.MEMBERS_LAST_FETCHED}:${guild.id}`)
      .then((v) => (v ? parseInt(v) : 0));

    if (lastFetched > Date.now() - ms("10 minute") && !forceFetch) {
      return getDatabaseMembers(guild.id);
    }

    let discordMembers: Collection<string, GuildMember>;

    if (guild.memberCount === guild.members.cache.size) {
      discordMembers = guild.members.cache;
    } else {
      discordMembers = await guild.members.fetch();
    }

    const discordMemberIds = discordMembers.map((i) => i.id);

    await redis.set(
      `${Constants.redis.cache.guild.MEMBERS_LAST_FETCHED}:${guild.id}`,
      Date.now(),
      "EX",
      ms("10 minute") / 1000,
    );

    await checkMembers(guild.id, discordMemberIds);

    return forceFetch ? discordMembers : discordMemberIds;
  } finally {
    mutex.release(`member_fetch_${guild.id}`);
  }
}
