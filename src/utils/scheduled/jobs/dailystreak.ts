import dayjs = require("dayjs");
import { parentPort } from "worker_threads";
import prisma from "../../database/database";

(async () => {
    const limit = dayjs().subtract(1, "day").subtract(4, "hours").toDate();

    const query = await prisma.economy.updateMany({
        where: {
            lastDaily: { lte: limit },
        },
        data: {
            dailyStreak: 0,
        },
    });

    parentPort.postMessage(`${query.count} daily streaks reset`);
})();
