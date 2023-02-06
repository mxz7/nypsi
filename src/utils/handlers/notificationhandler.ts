import { ClusterManager } from "discord-hybrid-sharding";
import redis from "../../init/redis";
import Constants from "../Constants";
import requestDM from "../functions/requestdm";
import { logger } from "../logger/logger";
import pAll = require("p-all");

let lastRun = 0;
const actions: (() => Promise<boolean>)[] = [];

export function listenForDms(manager: ClusterManager) {
  setInterval(async () => {
    if (lastRun > Date.now() - 30000) return;

    if ((await redis.llen(Constants.redis.nypsi.DM_QUEUE)) != 0) {
      logger.info("executing dm queue...");
      doDmQueueInterval(manager).catch(() => {
        lastRun = 0;
      });
    }
  }, 5_000);
}

async function doDmQueueInterval(manager: ClusterManager): Promise<void> {
  if ((await redis.llen(Constants.redis.nypsi.DM_QUEUE)) == 0) {
    await pAll(actions, { concurrency: 5 });

    actions.length = 0;

    logger.info("dm queue finished");
    return;
  }

  const item = JSON.parse(await redis.rpop(Constants.redis.nypsi.DM_QUEUE));

  if (!item) {
    logger.info(await redis.llen(Constants.redis.nypsi.DM_QUEUE));
  }

  actions.push(() =>
    requestDM({
      client: manager,
      content: item.payload.content,
      memberId: item.memberId,
      embed: item.payload.embed,
      components: item.payload.components,
    })
  );

  lastRun = Date.now();

  return doDmQueueInterval(manager);
}
