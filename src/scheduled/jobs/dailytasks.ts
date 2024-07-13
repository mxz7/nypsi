import { exec } from "child_process";
import prisma from "../../init/database";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";
import {
  addInlineNotification,
  addNotificationToQueue,
  getDmSettings,
} from "../../utils/functions/users/notifications";
import pAll = require("p-all");

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

    const promises: (() => Promise<any>)[] = [];

    for (const user of query) {
      promises.push(async () => {
        const completed = await prisma.task.count({
          where: { AND: [{ user_id: user.user_id }, { type: "daily" }, { completed: true }] },
        });

        if (completed === 3) {
          await prisma.economy.update({
            where: { userId: user.user_id },
            data: { dailyTaskStreak: { increment: 1 } },
          });
        } else {
          const streak = await prisma.economy.findUnique({
            where: { userId: user.user_id },
            select: { dailyTaskStreak: true },
          });

          await prisma.economy.update({
            where: { userId: user.user_id },
            data: { dailyTaskStreak: 0 },
          });

          if (streak.dailyTaskStreak > 5) {
            const embed = new CustomEmbed()
              .setColor(Constants.EMBED_FAIL_COLOR)
              .setDescription(
                `**you lost your daily task streak ):**\n\n` +
                  `you didnt complete all of your daily tasks and lost your streak of ${streak.dailyTaskStreak.toLocaleString()} ):`,
              );

            if ((await getDmSettings(user.user_id)).other)
              addNotificationToQueue({ memberId: user.user_id, payload: { embed } });
            else addInlineNotification({ memberId: user.user_id, embed });
          }
        }
      });
    }

    await pAll(promises, { concurrency: 7 });

    const count = await prisma.task.deleteMany({ where: { type: "daily" } });
    exec(`redis-cli KEYS "cache:economy:tasks:*" | xargs redis-cli DEL`);

    log(`${count.count} daily tasks deleted`);
  },
} satisfies Job;
