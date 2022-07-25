import dayjs = require("dayjs");
import { parentPort } from "worker_threads";
import prisma from "../../database/database";

(async () => {
    const limit = dayjs().subtract(1, "month").toDate();

    const c = await prisma.mention.deleteMany({
        where: {
            date: { lte: limit },
        },
    });

    if (c.count > 0) {
        parentPort.postMessage(`${c.count} mentions deleted`);
    }

    process.exit(0);
})();
