import { Job } from "../../types/Jobs";
import { MStoTime } from "../../utils/functions/date";
import { calcItemValue } from "../../utils/functions/economy/inventory";
import {
  topBalanceGlobal,
  topChatReactionGlobal,
  topCommandUsesGlobal,
  topDailyStreakGlobal,
  topItemGlobal,
  topLottoWinsGlobal,
  topNetWorthGlobal,
  topPrestigeGlobal,
  topVoteGlobal,
  topVoteStreakGlobal,
  topWordleGlobal,
  topWordleTimeGlobal,
} from "../../utils/functions/economy/top";
import { getItems } from "../../utils/functions/economy/utils";
import sleep from "../../utils/functions/sleep";
import { logger } from "../../utils/logger";

export default {
  name: "seed leaderboards",
  cron: "0 4 * * *",
  run: async () => {
    const start = Date.now();
    const itemIds = Object.keys(getItems()).filter((i) => i !== "lottery_ticket");

    await topBalanceGlobal(100);
    await sleep(1000);
    await topDailyStreakGlobal("", 100);
    await sleep(1000);
    await topPrestigeGlobal("", 100);
    await sleep(1000);
    await topNetWorthGlobal("", 100);
    await sleep(1000);
    await topWordleGlobal("");
    await sleep(1000);
    await topVoteGlobal("", 100);
    await sleep(1000);
    await topChatReactionGlobal("", false, 100);
    await sleep(1000);
    await topChatReactionGlobal("", true, 100);
    await sleep(1000);
    await topCommandUsesGlobal("");
    await sleep(1000);
    await topVoteStreakGlobal();
    await sleep(1000);
    await topWordleTimeGlobal();
    await sleep(1000);
    await topLottoWinsGlobal();

    for (const item of itemIds) {
      await sleep(1000);
      await topItemGlobal(item, "", 100);
      await calcItemValue(item);
    }

    const end = Date.now();

    logger.info(`leaderboards seeded in ${MStoTime(end - start)}`);
  },
} satisfies Job;
