import prisma from "../../init/database";
import { Job } from "../../types/Jobs";

export default {
  name: "daily tasks",
  cron: "0 0 * * *",
  async run(log) {
    const query = await prisma.task.groupBy({
      by: "user_id",
      _count: {
        completed: true,
      },
      where: {
        type: "daily",
      },
    });

    console.log(query);

    for (const user of query) {
      if (user._count.completed === 3) {
        await prisma.economy.update({
          where: { userId: user.user_id },
          data: { dailyTaskStreak: { increment: 1 } },
        });
      }
    }

    const count = await prisma.task.deleteMany({ where: { type: "daily" } });

    log(`${count.count} daily tasks deleted`);
  },
} satisfies Job;
