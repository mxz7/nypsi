import { Collection, Guild, GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { MapCache } from "../../cache";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { Mutex } from "../mutex";
import ms = require("ms");

const mutex = new Mutex(true);
const checkMutex = new Mutex();

const recentlyFetched = new MapCache<number>(ms("1 hour"));
const oftenFetched = new MapCache<number>(ms("12 hour"));

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

/**
 *
 * @param guildId
 * @param discordMembers user ids from discord api
 * @param wantedDiscord if true, they only wanted discord data - we only update db if data is already in there. if false, they only wanted ids meaning we should put in database no matter what
 */
async function checkMembers(guildId: string, discordMembers: string[], wantedDiscord: boolean) {
  const mutexKey = `check_members_${guildId}`;
  await checkMutex.acquire(mutexKey);

  const before = performance.now();
  let filteringTime: number;

  try {
    if (wantedDiscord) {
      const check = await prisma.guildMember.findFirst({ where: { guildId } });
      // no data in database, and caller only wanted discord data. not necessary to save
      if (!check) return;
    }

    const databaseMembers = await getDatabaseMembers(guildId);

    const beforeFiltering = performance.now();

    const dbSet = new Set(databaseMembers);
    const discordSet = new Set(discordMembers);

    const missing = discordMembers.filter((x) => !dbSet.has(x));
    const extra = databaseMembers.filter((x) => !discordSet.has(x));

    filteringTime = performance.now() - beforeFiltering;

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
  } finally {
    checkMutex.release(mutexKey);

    logger.debug(`members: checkMembers duration`, {
      guildId,
      durationMs: +(performance.now() - before).toFixed(2),
      filteringTimeMs: filteringTime ? +filteringTime.toFixed(2) : undefined,
    });
  }
}

export async function getAllMembers(
  guild: Guild,
  getCollection: true,
): Promise<Collection<string, GuildMember>>;
export async function getAllMembers(guild: Guild, getCollection?: false): Promise<string[]>;
export async function getAllMembers(guild: string): Promise<string[]>;
export async function getAllMembers(
  guild: Guild | string,
  getCollection = false,
): Promise<string[] | Collection<string, GuildMember>> {
  const totalStart = performance.now();

  const guildId = guild instanceof Guild ? guild.id : guild;

  const mutexKey = `member_fetch_${guildId}`;
  const acquireStart = performance.now();
  console.trace();
  await mutex.acquire(mutexKey);
  const acquireDuration = performance.now() - acquireStart;

  try {
    const lastFetchedStart = performance.now();
    const lastFetched = await redis
      .get(`${Constants.redis.cache.guild.MEMBERS_LAST_FETCHED}:${guildId}`)
      .then((v) => (v ? parseInt(v) : 0));
    const lastFetchedDuration = performance.now() - lastFetchedStart;

    if (
      (lastFetched > Date.now() - ms("10 minute") && !getCollection) ||
      !(guild instanceof Guild)
    ) {
      const dbMembersStart = performance.now();
      const members = await getDatabaseMembers(guildId);
      const dbMembersDuration = performance.now() - dbMembersStart;

      logger.debug(`members: getAllMembers timings`, {
        guildId,
        memberCount: members.length,
        getCollection,
        usedDatabaseOnly: true,
        timingsMs: {
          acquireMutex: +acquireDuration.toFixed(2),
          getLastFetched: +lastFetchedDuration.toFixed(2),
          getDatabaseMembers: +dbMembersDuration.toFixed(2),
          total: +(performance.now() - totalStart).toFixed(2),
        },
      });

      return members;
    }

    let discordMembers: Collection<string, GuildMember>;
    let resolveDiscordMembersDuration = 0;

    if (
      guild.memberCount === guild.members.cache.size ||
      (lastFetched > Date.now() - ms("3 minute") && getCollection)
    ) {
      const resolveDiscordMembersStart = performance.now();
      discordMembers = guild.members.cache;
      resolveDiscordMembersDuration = performance.now() - resolveDiscordMembersStart;
    } else {
      const resolveDiscordMembersStart = performance.now();
      await redis.set(
        `${Constants.redis.cache.guild.MEMBERS_LAST_FETCHED}:${guild.id}`,
        Date.now(),
        "EX",
        ms("10 minute") / 1000,
      );
      discordMembers = await guild.members.fetch();
      resolveDiscordMembersDuration = performance.now() - resolveDiscordMembersStart;
    }

    const mapIdsStart = performance.now();
    const discordMemberIds = discordMembers.map((i) => i.id);
    const mapIdsDuration = performance.now() - mapIdsStart;

    if (lastFetched < Date.now() - ms("10 minute")) {
      checkMembers(guild.id, discordMemberIds, getCollection);
    }

    logger.debug(`members: getAllMembers timings`, {
      guildId,
      memberCount: discordMemberIds.length,
      getCollection,
      usedDatabaseOnly: false,
      timingsMs: {
        acquireMutex: +acquireDuration.toFixed(2),
        getLastFetched: +lastFetchedDuration.toFixed(2),
        resolveDiscordMembers: +resolveDiscordMembersDuration.toFixed(2),
        mapDiscordMemberIds: +mapIdsDuration.toFixed(2),
        total: +(performance.now() - totalStart).toFixed(2),
      },
    });

    if (getCollection) {
      const recentFetch = recentlyFetched.get(guildId);
      const oftenFetch = oftenFetched.get(guildId);

      recentlyFetched.set(guildId, (recentFetch || 0) + 1);

      if (recentFetch && recentFetch >= 4) {
        oftenFetched.set(guildId, (oftenFetch || 0) + 1);
      }

      return discordMembers;
    }

    return discordMemberIds;
  } finally {
    mutex.release(mutexKey);
  }
}

export function canDiscardGuildMember(guildId: string): boolean {
  const recentFetch = recentlyFetched.get(guildId);
  const oftenFetch = oftenFetched.get(guildId);

  return !(recentFetch || oftenFetch);
}
