import prisma from "../../init/database";
import redis from "../../init/redis";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";

export default {
  name: "hourly bot stats",
  cron: "0 * * * *",
  async run(log) {
    const queries = await redis.lrange(Constants.redis.nypsi.HOURLY_DB_REPORT, 0, -1);
    await redis.del(Constants.redis.nypsi.HOURLY_DB_REPORT);

    let total = parseInt(queries.reduce((a, b) => (parseInt(a) + parseInt(b)).toString()));
    let avg = (total / queries.length).toFixed(2);

    log(`average query takes ${avg}ms (${total.toLocaleString()} queries in the last hour)`);

    await prisma.botMetrics.createMany({
      data: [
        {
          category: "hourly_query",
          value: total,
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
  },
} satisfies Job;
