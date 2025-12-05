import dayjs = require("dayjs");
import { ClusterManager } from "discord-hybrid-sharding";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";
import { addBooster } from "../../utils/functions/economy/boosters";
import { getItems } from "../../utils/functions/economy/utils";
import { sendToAnnouncements } from "../../utils/functions/news";

const GLOBAL_BOOSTER_TARGET = 500_000;

export default {
  name: "active users",
  cron: "0 0 * * *",
  async run(log, manager) {
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

    const commandsCount = await redis
      .get(Constants.redis.nypsi.DAILY_COMMANDS)
      .then((r) => parseInt(r));

    await redis.del(Constants.redis.nypsi.DAILY_COMMANDS);

    await prisma.botMetrics.create({
      data: {
        category: "daily_commands",
        value: commandsCount,
      },
    });

    const currentCount = await redis.incrby(
      Constants.redis.nypsi.GLOBAL_BOOSTER_PROGRESS,
      commandsCount,
    );

    if (currentCount >= GLOBAL_BOOSTER_TARGET) {
      activateGlobalBooster(manager);
    }
  },
} satisfies Job;

async function activateGlobalBooster(manager: ClusterManager) {
  await redis.set(Constants.redis.nypsi.GLOBAL_BOOSTER_PROGRESS, 0);
  await addBooster(
    Constants.BOT_USER_ID,
    "global_double_xp",
    1,
    dayjs().add(getItems()["global_double_xp"].boosterEffect.time, "seconds").toDate(),
    "global",
  );

  await sendToAnnouncements(manager, {
    content: "✨ a **12 hour** global double xp booster has been activated!!",
  });
}
