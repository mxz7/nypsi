import dayjs = require("dayjs");
import { parentPort } from "worker_threads";
import prisma from "../../database/database";

(async () => {
    const old = dayjs().subtract(180, "days").toDate();

    const d = await prisma.username.deleteMany({
        where: {
            AND: [{ type: "username" }, { date: { lt: old } }],
        },
    });

    if (d.count > 0) {
        parentPort.postMessage(`${d.count.toLocaleString()} old usernames deleted from database`);
    }

    process.exit(0);
})();
