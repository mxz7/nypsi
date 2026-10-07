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
          if ("permissionOverwrites" in channel) {
            permissionOverwrites += channel.permissionOverwrites.cache.size;
          }
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
        if (channel.isThread()) {
          cache.threads++;
          if (channel.archived) cache.archivedThreads++;
        }
        if (channel.isDMBased()) cache.dmChannels++;
        if ("permissionOverwrites" in channel) {
          cache.permissionOverwrites += channel.permissionOverwrites.cache.size;
        }
      }

      return {
        cluster: client.cluster.id,
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        arrayBuffers: mem.arrayBuffers,
        cache,
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
