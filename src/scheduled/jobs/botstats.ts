import prisma from "../../init/database";
import redis from "../../init/redis";
import { NypsiClient } from "../../models/Client";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";

export default {
  name: "hourly bot stats",
  cron: "0 * * * *",
  async run(log, manager) {
    const queries = await redis.lrange(Constants.redis.nypsi.HOURLY_DB_REPORT, 0, -1);
    const queryCounts = await redis.hgetall(Constants.redis.nypsi.HOURLY_DB_REPORT_COUNT);
    await redis.del(
      Constants.redis.nypsi.HOURLY_DB_REPORT,
      Constants.redis.nypsi.HOURLY_DB_REPORT_COUNT,
    );

    let total = queries.reduce((sum, duration) => sum + parseFloat(duration), 0);
    let avg = queries.length > 0 ? total / queries.length : 0;

    log(
      `average query took ${avg.toFixed(2)}ms (${queries.length.toLocaleString()} queries since the last report)`,
      {
        queryCountsTotal: Object.values(queryCounts).reduce(
          (sum, count) => sum + parseInt(count),
          0,
        ),
        queryCounts,
      },
    );

    await prisma.botMetrics.createMany({
      data: [
        {
          category: "hourly_query",
          value: queries.length,
        },
        {
          category: "hourly_query_time",
          value: avg,
        },
      ],
    });

    const commands = await redis.lrange(Constants.redis.nypsi.HOURLY_COMMAND_PREPROCESS, 0, -1);
    await redis.del(Constants.redis.nypsi.HOURLY_COMMAND_PREPROCESS);

    total = commands.reduce((sum, duration) => sum + parseFloat(duration), 0);
    avg = commands.length > 0 ? total / commands.length : 0;

    log(
      `average cmd pre process took ${avg.toFixed(2)}ms (${commands.length.toLocaleString()} cmds since the last report)`,
    );

    await prisma.botMetrics.createMany({
      data: [
        {
          category: "hourly_preprocess",
          value: commands.length,
        },
        {
          category: "hourly_preprocess_time",
          value: avg,
        },
      ],
    });

    const rawResults = await manager.broadcastEval((c) => {
      const client = c as unknown as NypsiClient;
      const mem = process.memoryUsage();
      const heap = require("node:v8").getHeapStatistics();
      const channelTypes: Record<string, number> = {};
      const disabledCacheBindings: Record<string, number> = {};
      const overwritePool = new Set<bigint>();
      let repeatedOverwriteFields = 0;
      let overwriteFieldsOutsidePool = 0;

      const countDisabledCache = (manager: unknown) => {
        const collection = (manager as { cache?: { maxSize?: number; keepOverLimit?: unknown } })
          ?.cache;
        if (collection?.maxSize !== 0 || collection.keepOverLimit) return;

        const name = manager.constructor.name;
        disabledCacheBindings[name] = (disabledCacheBindings[name] || 0) + 1;
      };

      const countOverwrites = (channel: unknown) => {
        const raw = Object.getOwnPropertyDescriptor(channel, "_rawPermissionOverwrites")?.value;
        if (Array.isArray(raw)) return raw.length;

        const manager = Object.getOwnPropertyDescriptor(channel, "permissionOverwrites")?.value;
        return manager?.cache.size || 0;
      };

      const observeOverwriteField = (bits: bigint) => {
        if (overwritePool.has(bits)) repeatedOverwriteFields++;
        else if (overwritePool.size < 1_024) overwritePool.add(bits);
        else overwriteFieldsOutsidePool++;
      };

      let linuxMemoryKiB: Record<string, number> = null;
      if (process.platform === "linux") {
        try {
          const smaps = require("node:fs").readFileSync("/proc/self/smaps_rollup", "utf8");
          linuxMemoryKiB = {};
          for (const line of smaps.split("\n")) {
            const match = line.match(/^(\w+):\s+(\d+) kB$/);
            if (match) linuxMemoryKiB[match[1]] = Number(match[2]);
          }
        } catch {
          linuxMemoryKiB = null;
        }
      }

      const sharpModule = require.cache[require.resolve("sharp")]
        ?.exports as typeof import("sharp");
      const sharpStats = sharpModule
        ? {
            cache: sharpModule.cache(),
            concurrency: sharpModule.concurrency(),
            counters: sharpModule.counters(),
          }
        : null;

      const cache = {
        guilds: client.guilds.cache.size,
        users: client.users.cache.size,
        members: 0,
        roles: 0,
        channels: client.channels.cache.size,
        threads: 0,
        archivedThreads: 0,
        dmChannels: 0,
        permissionOverwrites: 0,
        largestMemberCache: 0,
      };

      const guildCaches = [];

      for (const guild of client.guilds.cache.values()) {
        const members = guild.members.cache.size;
        const roles = guild.roles.cache.size;
        let permissionOverwrites = 0;

        for (const channel of guild.channels.cache.values()) {
          permissionOverwrites += countOverwrites(channel);
        }

        for (const name of [
          "commands",
          "bans",
          "presences",
          "voiceStates",
          "stageInstances",
          "invites",
          "scheduledEvents",
          "autoModerationRules",
          "emojis",
          "stickers",
        ]) {
          countDisabledCache(Object.getOwnPropertyDescriptor(guild, name)?.value);
        }

        cache.members += members;
        cache.roles += roles;
        cache.largestMemberCache = Math.max(cache.largestMemberCache, members);
        guildCaches.push({
          guildId: guild.id,
          members,
          roles,
          channels: guild.channels.cache.size,
          permissionOverwrites,
        });
      }

      for (const channel of client.channels.cache.values()) {
        channelTypes[channel.type] = (channelTypes[channel.type] || 0) + 1;
        countDisabledCache(Object.getOwnPropertyDescriptor(channel, "messages")?.value);
        countDisabledCache(Object.getOwnPropertyDescriptor(channel, "threads")?.value);
        countDisabledCache(Object.getOwnPropertyDescriptor(channel, "members")?.value);

        if (channel.isThread()) {
          cache.threads++;
          if (channel.archived) cache.archivedThreads++;
        }
        if (channel.isDMBased()) cache.dmChannels++;
        cache.permissionOverwrites += countOverwrites(channel);
        const raw = Object.getOwnPropertyDescriptor(channel, "_rawPermissionOverwrites")?.value;
        if (Array.isArray(raw)) {
          for (const overwrite of raw) {
            observeOverwriteField(BigInt(overwrite.deny));
            observeOverwriteField(BigInt(overwrite.allow));
          }
        } else {
          const manager = Object.getOwnPropertyDescriptor(channel, "permissionOverwrites")?.value;
          if (!manager) continue;
          for (const overwrite of manager.cache.values()) {
            observeOverwriteField(overwrite.deny.bitfield);
            observeOverwriteField(overwrite.allow.bitfield);
          }
        }
      }

      return {
        cluster: client.cluster.id,
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        arrayBuffers: mem.arrayBuffers,
        heapPhysical: heap.total_physical_size,
        v8Malloced: heap.malloced_memory,
        linuxMemoryKiB,
        runtime: {
          node: process.version,
          platform: process.platform,
          mallocArenaMax: process.env.MALLOC_ARENA_MAX || null,
          jemallocPreloaded: /jemalloc/.test(process.env.LD_PRELOAD || ""),
        },
        sharpStats,
        cache,
        channelTypes,
        disabledCacheBindings,
        overwriteSharing: {
          poolSize: overwritePool.size,
          repeatedFields: repeatedOverwriteFields,
          fieldsOutsidePool: overwriteFieldsOutsidePool,
        },
        largestMemberCaches: guildCaches.toSorted((a, b) => b.members - a.members).slice(0, 5),
        largestOverwriteCaches: guildCaches
          .toSorted((a, b) => b.permissionOverwrites - a.permissionOverwrites)
          .slice(0, 5),
      };
    });

    const bytesToMb = (b: number) => +(b / 1024 / 1024).toFixed(2);

    const results = Object.fromEntries(
      rawResults.map((r: { cluster: number; rss: number; heapUsed: number; heapTotal: number }) => [
        r.cluster,
        `rss=${bytesToMb(r.rss)}mb heap=${bytesToMb(r.heapUsed)}/${bytesToMb(r.heapTotal)}mb`,
      ]),
    );

    const mainMem = process.memoryUsage();
    log("memory: cluster usage", {
      clusters: results,
      cacheDetails: rawResults,
      main: `rss=${bytesToMb(mainMem.rss)}mb heap=${bytesToMb(mainMem.heapUsed)}/${bytesToMb(mainMem.heapTotal)}mb`,
    });
  },
} satisfies Job;
