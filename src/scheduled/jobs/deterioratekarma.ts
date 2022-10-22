import ms = require("ms");
import { parentPort } from "worker_threads";
import prisma from "../../init/database";
import redis from "../../init/redis";
import Constants from "../../utils/Constants";

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

    let karmaToRemove = 1;

    if (now - ms("2 days") > user.lastCommand.getTime()) {
      karmaToRemove += 7;
    }

    if (now - ms("1 week") > user.lastCommand.getTime()) {
      karmaToRemove += 10;
    }

    if (now - ms("30 days") > user.lastCommand.getTime()) {
      karmaToRemove += 50;
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

    await redis.del(`${Constants.redis.cache.user.KARMA}:${user.id}`);
  }

  parentPort.postMessage(`${total} total karma deteriorated`);
  process.exit(0);
})();
