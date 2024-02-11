import prisma from "../../init/database";
import redis from "../../init/redis";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";

export default {
  name: "weekly tasks",
  cron: "0 0 * * 1",
  async run(log) {
    const query = await prisma.task.groupBy({
      by: "user_id",
      _count: {
        completed: true,
      },
      where: {
        type: "weekly",
      },
    });

    for (const user of query) {
      await redis.del(`${Constants.redis.cache.economy.TASKS}:${user.user_id}`);
      if (user._count.completed === 3) {
        await prisma.economy.update({
          where: { userId: user.user_id },
          data: { weeklyTaskStreak: { increment: 1 } },
        });
      } else {
        await prisma.economy.update({
          where: { userId: user.user_id },
          data: { weeklyTaskStreak: 0 },
        });
      }
    }

    const count = await prisma.task.deleteMany({ where: { type: "weekly" } });

    log(`${count.count} weekly tasks deleted`);
  },
} satisfies Job;
