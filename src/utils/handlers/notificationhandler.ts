import { ClusterManager } from "discord-hybrid-sharding";
import redis from "../../init/redis";
import Constants from "../Constants";
import requestDM from "../functions/requestdm";
import sleep from "../functions/sleep";
import { logger } from "../logger";
import pAll = require("p-all");

let lastRun = 0;
const actions: (() => Promise<boolean>)[] = [];
let running = false;

export function listenForDms(manager: ClusterManager) {
  setInterval(async () => {
    if (lastRun > Date.now() - 10_000) return;

    if ((await redis.llen(Constants.redis.nypsi.DM_QUEUE)) != 0 && !running) {
      logger.info("executing dm queue...");
      running = true;
      doDmQueueInterval(manager)
        .then(() => {
          running = false;
        })
        .catch(() => {
          lastRun = 0;
          running = false;
        });
    }
  }, 5_000);
}

async function doDmQueueInterval(manager: ClusterManager): Promise<void> {
  if ((await redis.llen(Constants.redis.nypsi.DM_QUEUE)) == 0) {
    await pAll(actions, { concurrency: 3 });

    actions.length = 0;

    logger.info("dm queue finished");
    return;
  }

  const item = JSON.parse(await redis.rpop(Constants.redis.nypsi.DM_QUEUE));

  if (!item) return;

  actions.push(async () => {
    // if (await redis.exists(Constants.redis.cache.user.DM_BLOCK)) {
    //   setTimeout(() => {
    //     redis.rpush(Constants.redis.nypsi.DM_QUEUE, JSON.stringify(item));
    //   }, 5000);
    //   return;
    // }

    // await redis.set(Constants.redis.cache.user.DM_BLOCK, "boobies", "EX", 5);

    await sleep(100);

    return await requestDM({
      client: manager,
      content: item.payload.content,
      memberId: item.memberId,
      embed: item.payload.embed,
      components: item.payload.components,
    });
  });

  lastRun = Date.now();

  return doDmQueueInterval(manager);
}
