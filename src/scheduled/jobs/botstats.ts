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

    let total = parseInt(queries.reduce((a, b) => (parseInt(a) + parseInt(b)).toString()));
    let avg = (total / queries.length).toFixed(2);

    log(
      `average query takes ${avg}ms (${queries.length.toLocaleString()} queries in the last hour)`,
      {
        queryCountsTotal: Object.values(queryCounts).reduce((a, b) =>
          (parseInt(a) + parseInt(b)).toString(),
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
          value: total / queries.length,
        },
      ],
    });

    const commands = await redis.lrange(Constants.redis.nypsi.HOURLY_COMMAND_PREPROCESS, 0, -1);
    await redis.del(Constants.redis.nypsi.HOURLY_COMMAND_PREPROCESS);

    total = parseInt(commands.reduce((a, b) => (parseInt(a) + parseInt(b)).toString()));
    avg = (total / commands.length).toFixed(2);

    log(`average cmd pre process takes ${avg}ms (${total.toLocaleString()} cmds in the last hour)`);

    await prisma.botMetrics.createMany({
      data: [
        {
          category: "hourly_preprocess",
          value: total,
        },
        {
          category: "hourly_preprocess_time",
          value: total / commands.length,
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
