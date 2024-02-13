import { exec } from "child_process";
import prisma from "../../init/database";
import { Job } from "../../types/Jobs";

export default {
  name: "weekly tasks",
  cron: "0 0 * * 1",
  async run(log) {
    const query = await prisma.task.groupBy({
      by: "user_id",
      where: {
        type: "weekly",
      },
    });

    for (const user of query) {
      const completed = await prisma.task.count({
        where: { AND: [{ user_id: user.user_id }, { type: "weekly" }, { completed: true }] },
      });

      if (completed === 3)
        await prisma.economy.update({
          where: { userId: user.user_id },
          data: { weeklyTaskStreak: { increment: 1 } },
        });
      else
        await prisma.economy.update({
          where: { userId: user.user_id },
          data: { weeklyTaskStreak: 0 },
        });
    }

    const count = await prisma.task.deleteMany({ where: { type: "weekly" } });
    exec(`redis-cli KEYS "cache:economy:tasks:*" | xargs redis-cli DEL`);

    log(`${count.count} daily tasks deleted`);
  },
} satisfies Job;
