import { exec } from "child_process";
import prisma from "../../init/database";
import { Job } from "../../types/Jobs";

export default {
  name: "daily tasks",
  cron: "0 0 * * *",
  async run(log) {
    const query = await prisma.task.groupBy({
      by: "user_id",
      where: {
        type: "daily",
      },
    });

    for (const user of query) {
      const completed = await prisma.task.count({
        where: { AND: [{ user_id: user.user_id }, { type: "daily" }, { completed: true }] },
      });

      if (completed === 3)
        await prisma.economy.update({
          where: { userId: user.user_id },
          data: { dailyTaskStreak: { increment: 1 } },
        });
      else
        await prisma.economy.update({
          where: { userId: user.user_id },
          data: { dailyTaskStreak: 0 },
        });
    }

    const count = await prisma.task.deleteMany({ where: { type: "daily" } });
    exec(`redis-cli KEYS "cache:economy:tasks:*" | xargs redis-cli DEL`);

    log(`${count.count} daily tasks deleted`);
  },
} satisfies Job;
