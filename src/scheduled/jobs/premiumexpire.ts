import prisma from "../../init/database";
import { Job } from "../../types/Jobs";
import { expireUser } from "../../utils/functions/premium/premium";
import dayjs = require("dayjs");

export default {
  name: "premiumexpire",
  cron: "45 23 * * *",
  async run(log, manager) {
    const query = await prisma.premium.findMany({
      where: {
        AND: [{ level: { gt: 0 } }, { credit: { lt: 1 } }, { expireDate: { lt: new Date() } }],
      },
      select: {
        userId: true,
      },
    });

    for (const user of query) {
      await expireUser(user.userId, manager);
    }

    log(`${query.length} members expired`);

    const gracePeriod = dayjs().subtract(21, "days").toDate();

    const pastGracePeriod = await prisma.premium.findMany({
      where: {
        AND: [{ level: 0 }, { credit: { lt: 1 } }, { expireDate: { lt: gracePeriod } }],
      },
      select: {
        userId: true,
      },
    });

    for (const user of pastGracePeriod) {
      await prisma.premiumCommand
        .delete({
          where: {
            owner: user.userId,
          },
        })
        .catch(() => {
          // doesnt need to find one
        });

      await prisma.premium.delete({
        where: {
          userId: user.userId,
        },
      });
    }

    log(`${pastGracePeriod.length} members fully expired (past grace period)`);

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
