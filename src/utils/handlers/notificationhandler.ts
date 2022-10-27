import { Manager } from "discord-hybrid-sharding";
import redis from "../../init/redis";
import Constants from "../Constants";
import requestDM from "../functions/requestdm";
import { logger } from "../logger";

let lastRun = 0;
const promises: Promise<boolean>[] = [];

export function listenForDms(manager: Manager) {
  setInterval(async () => {
    if (lastRun > Date.now() - 30000) return;

    if ((await redis.llen(Constants.redis.nypsi.DM_QUEUE)) != 0) {
      logger.debug("executing dm queue...");
      doDmQueueInterval(manager).catch(() => {
        lastRun = 0;
      });
    }
  }, 5_000);
}

async function doDmQueueInterval(manager: Manager): Promise<void> {
  if ((await redis.llen(Constants.redis.nypsi.DM_QUEUE)) == 0) {
    await Promise.all(promises);

    promises.length = 0;

    logger.debug("dm queue finished");
    return;
  }

  const item = JSON.parse(await redis.rpop(Constants.redis.nypsi.DM_QUEUE));

  if (!item) {
    logger.info(await redis.llen(Constants.redis.nypsi.DM_QUEUE));
  }

  promises.push(
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
