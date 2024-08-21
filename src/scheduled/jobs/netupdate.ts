import prisma from "../../init/database";
import redis from "../../init/redis";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";
import { MStoTime } from "../../utils/functions/date";
import { calcNetWorth } from "../../utils/functions/economy/balance";
import sleep from "../../utils/functions/sleep";
import pAll = require("p-all");

export default {
  name: "netupdate",
  cron: "0 0 * * *",
  async run(log) {
    const start = Date.now();
    const query = await prisma.economy.findMany({
      select: {
        userId: true,
      },
    });

    const actions = [];

    for (const user of query) {
      await sleep(25);
      if (await redis.exists(`${Constants.redis.cache.economy.NETWORTH}:${user.userId}`)) continue;

      actions.push(async () => {
        await calcNetWorth(user.userId);
      });
    }

    await pAll(actions, { concurrency: 2 });

    log(`net worth updated for ${actions.length} members in ${MStoTime(Date.now() - start)}`);
  },
} satisfies Job;
