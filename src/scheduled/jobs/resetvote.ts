import prisma from "../../init/database";
import { Job } from "../../types/Jobs";
import { publishLeaderboardUpdate } from "../../utils/functions/leaderboards/publish";

export default {
  name: "reset vote",
  cron: "0 0 1 * *",
  async run(log) {
    const users = await prisma.economy.findMany({
      where: {
        monthVote: { gt: 0 },
      },
      select: {
        userId: true,
      },
    });
    const query = await prisma.economy.updateMany({
      where: {
        monthVote: { gt: 0 },
      },
      data: { monthVote: 0 },
    });

    for (const user of users) {
      publishLeaderboardUpdate("vote-month", user.userId, "0");
    }

    log(`${query.count} users reset to 0 monthly votes`);
  },
} satisfies Job;
