import prisma from "../../init/database";
import redis from "../../init/redis";
import Constants from "../../utils/Constants";
import { MStoTime } from "../../utils/functions/date";
import { calcNetWorth } from "../../utils/functions/economy/balance";
import sleep from "../../utils/functions/sleep";
import { logger } from "../../utils/logger";

import dayjs = require("dayjs");
import ms = require("ms");
import pAll = require("p-all");

async function updateNetWorth() {
  logger.info("net worths updating...");
  const start = Date.now();
  const query = await prisma.economy.findMany({
    select: {
      userId: true,
    },
  });

  const actions: (() => Promise<number>)[] = [];

  for (const user of query) {
    await sleep(50);
    if (await redis.exists(`${Constants.redis.cache.economy.NETWORTH}:${user.userId}`)) continue;

    if (actions.length == 0) {
      await calcNetWorth(user.userId);

      actions.push(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(1);
          }, 500);
        });
      });
    } else {
      actions.push(() => calcNetWorth(user.userId));
    }
  }

  actions.splice(0, 1);

  await pAll(actions, { concurrency: 5 });

  logger.info(`net worth updated for ${actions.length} members in ${MStoTime(Date.now() - start)}`);
}

export function runNetWorthInterval() {
  const next = dayjs().add(1, "day").startOf("day").subtract(30, "minutes").toDate();

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
