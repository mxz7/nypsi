import prisma from "../../init/database";
import { Job } from "../../types/Jobs";

export default {
  name: "reset vote",
  cron: "0 0 1 * *",
  async run(log) {
    const query = await prisma.economy.updateMany({
      where: {
        monthVote: { gt: 0 },
      },
      data: { monthVote: 0 },
    });

    log(`${query.count} users reset to 0 monthly votes`);
  },
} satisfies Job;
