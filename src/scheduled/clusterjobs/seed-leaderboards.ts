import dayjs = require("dayjs");
import { MStoTime } from "../../utils/functions/date";
import {
  topBalanceGlobal,
  topDailyStreakGlobal,
  topItemGlobal,
  topNetWorthGlobal,
  topPrestigeGlobal,
  topWordleGlobal,
} from "../../utils/functions/economy/top";
import { getItems } from "../../utils/functions/economy/utils";
import sleep from "../../utils/functions/sleep";
import { logger } from "../../utils/logger";
import ms = require("ms");

async function leaderboardThing() {
  logger.info("::auto seeding leaderboards...");
  const start = Date.now();
  const itemIds = Object.keys(getItems());

  await topBalanceGlobal(100);
  await sleep(5000);
  await topDailyStreakGlobal("");
  await sleep(5000);
  await topPrestigeGlobal("");
  await sleep(5000);
  await topNetWorthGlobal("");
  await sleep(5000);
  await topWordleGlobal("");

  for (const item of itemIds) {
    await sleep(5000);
    await topItemGlobal(item, "");
  }

  const end = Date.now();

  logger.info(`::auto leaderboards seeded in ${MStoTime(end - start)}`);
}

export function doLeaderboardSeed() {
  const start = dayjs()
    .add(1, "day")
    .set("seconds", 0)
    .set("minutes", 0)
    .set("hours", 2)
    .toDate()
    .getTime();

  setTimeout(() => {
    leaderboardThing();
    setInterval(leaderboardThing, ms("24 hours"));
  }, start - Date.now());

  logger.info(`::auto leaderboards will be seeded in ${MStoTime(start - Date.now())}`);
}
