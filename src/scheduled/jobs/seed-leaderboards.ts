import { Job } from "../../types/Jobs";
import { MStoTime } from "../../utils/functions/date";
import { calcItemValue } from "../../utils/functions/economy/inventory";
import { getItems } from "../../utils/functions/economy/utils";
import { topChatReactionGlobal } from "../../utils/functions/leaderboards/chat-reactions";
import { topCommandUsesGlobal } from "../../utils/functions/leaderboards/commands";
import {
  topBalanceGlobal,
  topItemGlobal,
  topLottoWins,
  topNetWorthGlobal,
  topPrestige,
  topVote,
} from "../../utils/functions/leaderboards/economy";
import { topDailyStreak, topVoteStreak } from "../../utils/functions/leaderboards/streaks";
import { topWordleGlobal, topWordleTimeGlobal } from "../../utils/functions/leaderboards/wordle";
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
    await topDailyStreak("global", undefined, "", 100);
    await sleep(1000);
    await topPrestige("global", undefined, undefined, 1000);
    await sleep(1000);
    await topNetWorthGlobal("", 100);
    await sleep(1000);
    await topWordleGlobal("");
    await sleep(1000);
    await topVote("global", undefined, "", 100);
    await sleep(1000);
    await topChatReactionGlobal("", false, 100);
    await sleep(1000);
    await topChatReactionGlobal("", true, 100);
    await sleep(1000);
    await topCommandUsesGlobal("");
    await sleep(1000);
    await topVoteStreak("global", undefined);
    await sleep(1000);
    await topWordleTimeGlobal();
    await sleep(1000);
    await topLottoWins("global", undefined);

    for (const item of itemIds) {
      await sleep(1000);
      await topItemGlobal(item, "", 100);
      await calcItemValue(item);
    }

    const end = Date.now();

    logger.info(`leaderboards seeded in ${MStoTime(end - start)}`);
  },
} satisfies Job;
