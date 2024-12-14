import dayjs = require("dayjs");
import prisma from "../../init/database";
import redis from "../../init/redis";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";
import { MStoTime } from "../../utils/functions/date";
import { calcNetWorth } from "../../utils/functions/economy/balance";
import sleep from "../../utils/functions/sleep";
import pAll = require("p-all");

export default {
  name: "netupdate-2",
  cron: "0 4 * * *",
  async run(log) {
    const start = Date.now();
    const query = await prisma.economy.findMany({
      select: {
        userId: true,
      },
      where: {
        AND: [
          {
            user: {
              lastCommand: { gt: dayjs().subtract(7, "day").toDate() },
            },
          },
          {
            user: {
              lastCommand: { lt: dayjs().subtract(1, "day").toDate() },
            },
          },
        ],
      },
    });

    const actions = [];

    for (const user of query) {
      await sleep(25);
      if (await redis.exists(`${Constants.redis.cache.economy.NETWORTH}:${user.userId}`)) continue;

      actions.push(async () => {
        await calcNetWorth("job", user.userId);
      });
    }

    await pAll(actions, { concurrency: 2 });

    log(`net worth updated for ${actions.length} members in ${MStoTime(Date.now() - start)}`);
  },
} satisfies Job;
