import dayjs = require("dayjs");
import prisma from "../../init/database";
import { Job } from "../../types/Jobs";

export default {
  name: "daily chat reaction purge",
  cron: "0 0 * * *",
  async run(log) {
    const query = await prisma.chatReactionLeaderboards.deleteMany({
      where: {
        daily: true,
      },
    });

    await prisma.leaderboards.deleteMany({
      where: {
        leaderboard: "chatreaction_daily",
      },
    });

    log(`${query.count} daily cr leaderboards deleted`);
  },
} satisfies Job;
