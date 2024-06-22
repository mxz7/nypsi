import dayjs = require("dayjs");
import prisma from "../../init/database";
import redis from "../../init/redis";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";

export default {
  name: "active users",
  cron: "0 0 * * *",
  async run(log) {
    const date = dayjs();

    if (date.date() === 1) {
      log("doing monthly");

      const count = await redis
        .smembers(Constants.redis.nypsi.MONTHLY_ACTIVE)
        .then((r) => r.length);

      await redis.del(Constants.redis.nypsi.MONTHLY_ACTIVE);

      await prisma.botMetrics.create({
        data: {
          category: "monthly_active_users",
          value: count,
        },
      });
    }

    const count = await redis.smembers(Constants.redis.nypsi.DAILY_ACTIVE).then((r) => r.length);

    await redis.del(Constants.redis.nypsi.DAILY_ACTIVE);

    await prisma.botMetrics.create({
      data: {
        category: "daily_active_users",
        value: count,
      },
    });
  },
} satisfies Job;
