import dayjs = require("dayjs");
import prisma from "../../init/database";
import redis from "../../init/redis";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";
import { MStoTime } from "../../utils/functions/date";
import { calcNetWorth } from "../../utils/functions/economy/balance";

export default {
  name: "netupdate-3",
  cron: "0 0 * * *",
  async run(log) {
    const start = Date.now();
    const query = await prisma.economy.findMany({
      select: {
        userId: true,
      },
      where: {
        user: {
          lastCommand: { gt: dayjs().subtract(1, "day").toDate() },
        },
      },
    });

    let count = 0;

    for (const user of query) {
      if (await redis.exists(`${Constants.redis.cache.economy.NETWORTH}:${user.userId}`)) continue;

      await calcNetWorth("job", user.userId);
      count++;
    }

    log(
      `net worth updated for ${count.toLocaleString()} members in ${MStoTime(Date.now() - start)}`,
    );
  },
} satisfies Job;
