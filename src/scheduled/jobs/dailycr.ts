import prisma from "../../init/database";
import { Job } from "../../types/Jobs";
import { publishLeaderboardUpdate } from "../../utils/functions/leaderboards/publish";

export default {
  name: "daily chat reaction purge",
  cron: "0 0 * * *",
  async run(log) {
    const users = await prisma.chatReactionLeaderboards.findMany({
      where: {
        daily: true,
      },
      select: {
        userId: true,
      },
    });
    const query = await prisma.chatReactionLeaderboards.deleteMany({
      where: {
        daily: true,
      },
    });

    for (const user of users) {
      publishLeaderboardUpdate("chatreaction-daily", user.userId, "0");
    }

    await prisma.leaderboards.deleteMany({
      where: {
        leaderboard: "chatreaction_daily",
      },
    });

    log(`${query.count} daily cr leaderboards deleted`);
  },
} satisfies Job;
