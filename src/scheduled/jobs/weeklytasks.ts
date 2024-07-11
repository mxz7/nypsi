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
      (async () => {
        const completed = await prisma.task.count({
          where: { AND: [{ user_id: user.user_id }, { type: "weekly" }, { completed: true }] },
        });

        if (completed === 3) {
          await prisma.economy.update({
            where: { userId: user.user_id },
            data: { weeklyTaskStreak: { increment: 1 } },
          });
        } else {
          const streak = await prisma.economy.findUnique({
            where: { userId: user.user_id },
            select: { weeklyTaskStreak: true },
          });

          await prisma.economy.update({
            where: { userId: user.user_id },
            data: { weeklyTaskStreak: 0 },
          });

          if (streak.weeklyTaskStreak > 3) {
            const embed = new CustomEmbed()
              .setColor(Constants.EMBED_FAIL_COLOR)
              .setDescription(
                `**you lost your weekly task streak ):**\n\n` +
                  `you didnt complete all of your weekly tasks and lost your streak of ${streak.weeklyTaskStreak.toLocaleString()} ):`,
              );

            if ((await getDmSettings(user.user_id)).other)
              addNotificationToQueue({ memberId: user.user_id, payload: { embed } });
            else addInlineNotification({ memberId: user.user_id, embed });
          }
        }
      })();
    }

    const count = await prisma.task.deleteMany({ where: { type: "weekly" } });
    exec(`redis-cli KEYS "cache:economy:tasks:*" | xargs redis-cli DEL`);

    log(`${count.count} daily tasks deleted`);
  },
} satisfies Job;
