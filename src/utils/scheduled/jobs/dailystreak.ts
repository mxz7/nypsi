import dayjs = require("dayjs");
import { parentPort } from "worker_threads";
import prisma from "../../database/database";

(async () => {
    const limit = dayjs().subtract(1, "day").subtract(6, "hours").toDate();

    const query = await prisma.economy.updateMany({
        where: {
            AND: [{ lastDaily: { lte: limit } }, { dailyStreak: 1 }],
        },
        data: {
            dailyStreak: 0,
        },
    });

    parentPort.postMessage(`${query.count} daily streaks reset`);
})();
