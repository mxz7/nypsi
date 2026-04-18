import { APIGuildMember, Routes } from "discord-api-types/v10";
import { Collection, Guild, GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import { MapCache } from "../../cache";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getRest } from "../../rest";
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
export async function checkMembers(
  guildId: string,
  discordMembers: string[],
  wantedDiscord: boolean,
) {
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

export type SlimMember = { userId: string; username: string; roles: string[] };

const restMembersCache = new MapCache<SlimMember[]>(ms("15 minutes"));
const restMutex = new Mutex();

export async function getAllMembersRest(
  guildId: string,
  client?: NypsiClient,
): Promise<SlimMember[]> {
  const cache = restMembersCache.get(guildId);

  if (cache) {
    return cache;
  }

  await restMutex.acquire(guildId);

  try {
    // re-check cache after acquiring lock in case another call already populated it
    const cached = restMembersCache.get(guildId);
    if (cached) return cached;

    const rest = getRest(client);

    const allMembers: SlimMember[] = [];
    let after: string | undefined;

    while (true) {
      const query = new URLSearchParams({ limit: "1000" });
      if (after) query.set("after", after);

      const batch = (await rest.get(Routes.guildMembers(guildId), { query })) as APIGuildMember[];

      allMembers.push(
        ...batch.map((m) => ({ userId: m.user!.id, roles: m.roles, username: m.user!.username })),
      );

      if (batch.length < 1000) break;

      after = batch.at(-1)!.user!.id;
    }

    restMembersCache.set(guildId, allMembers);

    const userIds = allMembers.map((m) => m.userId);

    void checkMembers(guildId, userIds, true).catch((error) => {
      logger.error("failed to update guild members in database", { guildId, error });
    });

    logger.debug(`fetched ${allMembers.length} members via REST`, { guildId });

    return allMembers;
  } finally {
    restMutex.release(guildId);
  }
}
