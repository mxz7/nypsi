import dayjs = require("dayjs");
import { parentPort } from "worker_threads";
import prisma from "../../database/database";

(async () => {
    const limit = dayjs().subtract(1, "day").subtract(3, "hours").toDate();

    const query = await prisma.economy.updateMany({
        where: {
            AND: [{ lastDaily: { lte: limit } }, { dailyStreak: { gt: 1 } }],
        },
        data: {
            dailyStreak: 0,
        },
    });

    if (query.count > 0) parentPort.postMessage(`${query.count} daily streaks reset`);

    process.exit(0);
})();
