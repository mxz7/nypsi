import prisma from "../../init/database";
import redis from "../../init/redis";
import Constants from "../../utils/Constants";
import { MStoTime } from "../../utils/functions/date";
import { calcNetWorth } from "../../utils/functions/economy/balance";
import { logger } from "../../utils/logger";

import dayjs = require("dayjs");
import ms = require("ms");

async function updateNetWorth() {
  const query = await prisma.economy.findMany({
    select: {
      userId: true,
    },
  });

  const promises: Promise<any>[] = [];

  for (const user of query) {
    if (await redis.exists(`${Constants.redis.cache.economy.NETWORTH}:${user.userId}`)) continue;

    if (promises.length == 0) {
      promises.push(calcNetWorth(user.userId));

      await Promise.all(promises);
    } else {
      promises.push(calcNetWorth(user.userId));
    }
  }

  promises.splice(0, 1);

  await Promise.all(promises);

  logger.info(`net updated for ${promises.length} members`);
}

export function runNetWorthInterval() {
  const next = dayjs().add(1, "day").startOf("day").toDate();

  const needed = next.getTime() - Date.now();

  setTimeout(() => {
    updateNetWorth();
    setInterval(() => {
      updateNetWorth();
    }, ms("1 day"));
  }, needed);

  logger.log({
    level: "auto",
    message: `net worth for all users will update in ${MStoTime(needed)}`,
  });
}
