import dayjs = require("dayjs");
import { MStoTime } from "../../utils/functions/date";
import { calcItemValue } from "../../utils/functions/economy/inventory";
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

  await topBalanceGlobal(1000);
  await sleep(1000);
  await topDailyStreakGlobal("", 1000);
  await sleep(1000);
  await topPrestigeGlobal("", 1000);
  await sleep(1000);
  await topNetWorthGlobal("", 1000);
  await sleep(1000);
  await topWordleGlobal("");

  for (const item of itemIds) {
    await sleep(1000);
    await topItemGlobal(item, "", 1000);
    await calcItemValue(item);
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
