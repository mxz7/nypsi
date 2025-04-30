import prisma from "../../init/database";
import { Job } from "../../types/Jobs";
import { expireUser } from "../../utils/functions/premium/premium";

export default {
  name: "premiumexpire",
  cron: "45 23 * * *",
  async run(log, manager) {
    const query = await prisma.premium.findMany({
      where: {
        AND: [{ credit: { lt: 1 } }, { expireDate: { lt: new Date() } }],
      },
      select: {
        userId: true,
      },
    });

    for (const user of query) {
      await expireUser(user.userId, manager);
    }

    log(`${query.length} members expired`);

    const reduceCredits = await prisma.premium.updateMany({
      where: {
        AND: [{ credit: { gt: 0 } }, { expireDate: { lt: new Date() } }],
      },
      data: {
        credit: { decrement: 1 },
      },
    });

    log(`${reduceCredits.count} credits removed`);
  },
} satisfies Job;