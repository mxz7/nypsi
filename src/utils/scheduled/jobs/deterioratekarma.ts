import ms = require("ms");
import { parentPort } from "worker_threads";
import prisma from "../../database/database";
import redis from "../../database/redis";

(async () => {
    const now = Date.now();

    const threshold = now - ms("7 hours");

    const users = await prisma.user.findMany({
        where: {
            karma: { gt: 1 },
        },
        select: {
            id: true,
            karma: true,
            lastCommand: true,
        },
    });

    let total = 0;

    for (const user of users) {
        if (user.lastCommand.getTime() > threshold) continue;

        let karmaToRemove = 5;

        if (now - ms("1 day") > user.lastCommand.getTime()) {
            karmaToRemove += 10;
        }

        if (now - ms("1 week") > user.lastCommand.getTime()) {
            karmaToRemove += 35;
        }

        if (now - ms("30 days") > user.lastCommand.getTime()) {
            karmaToRemove += 100;
        }

        if (now - ms("90 days") > user.lastCommand.getTime()) {
            karmaToRemove += 69420;
        }

        if (karmaToRemove > user.karma) {
            karmaToRemove = user.karma - 1;
        }

        total += karmaToRemove;

        await prisma.user.update({
            where: {
                id: user.id,
            },
            data: {
                karma: { decrement: karmaToRemove },
            },
        });

        await redis.del(`cache:user:karma:${user.id}`);
    }

    parentPort.postMessage(`${total} total karma deteriorated`);
    process.exit(0);
})();
