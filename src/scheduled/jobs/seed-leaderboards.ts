import { Job } from "../../types/Jobs";
import { MStoTime } from "../../utils/functions/date";
import { calcItemValue } from "../../utils/functions/economy/inventory";
import { getItems } from "../../utils/functions/economy/utils";
import { topChatReaction } from "../../utils/functions/leaderboards/chat-reactions";
import { topCommandUsesGlobal } from "../../utils/functions/leaderboards/commands";
import {
  topBalance,
  topItem,
  topLottoWins,
  topNetWorth,
  topPrestige,
  topVote,
} from "../../utils/functions/leaderboards/economy";
import { topDailyStreak, topVoteStreak } from "../../utils/functions/leaderboards/streaks";
import { topWordle, topWordleTimeGlobal } from "../../utils/functions/leaderboards/wordle";
import sleep from "../../utils/functions/sleep";
import { logger } from "../../utils/logger";

export default {
  name: "seed leaderboards",
  cron: "0 4 * * *",
  run: async () => {
    const start = Date.now();
    const itemIds = Object.keys(getItems()).filter((i) => i !== "lottery_ticket");

    await topBalance("global", undefined, undefined, 100);
    await sleep(1000);
    await topDailyStreak("global", undefined, "", 100);
    await sleep(1000);
    await topPrestige("global", undefined, undefined, 1000);
    await sleep(1000);
    await topNetWorth("global", undefined, "", 100);
    await sleep(1000);
    await topWordle("global", undefined, "", 100);
    await sleep(1000);
    await topVote("global", undefined, "", 100);
    await sleep(1000);
    await topChatReaction("global", undefined, false, "", 100);
    await sleep(1000);
    await topChatReaction("global", undefined, true, "", 100);
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
      await topItem("global", undefined, item, "", 100);
      await calcItemValue(item);
    }

    const end = Date.now();

    logger.info(`leaderboards seeded in ${MStoTime(end - start)}`);
  },
} satisfies Job;
