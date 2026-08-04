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

      return {
        cluster: client.cluster.id,
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
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
    log("cluster memory usage", {
      clusters: results,
      main: `rss=${bytesToMb(mainMem.rss)}mb heap=${bytesToMb(mainMem.heapUsed)}/${bytesToMb(mainMem.heapTotal)}mb`,
    });
  },
} satisfies Job;
