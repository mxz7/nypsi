import { Queue } from "bullmq";
import ms from "ms";
import redis from "../../init/redis";
import { DMJobData } from "../../types/workers/dms";
import { MentionJobData } from "../../types/workers/mentions";
import { logger } from "../logger";

export const dmQueue = new Queue<DMJobData>("dms", { connection: redis });
export const mentionQueue = new Queue<MentionJobData>("mentions", { connection: redis });

setInterval(async () => {
  if (logger.meta["cluster"] !== "main") return;

  let deleted = [];
  await dmQueue.clean(ms("1 hour"), 1000, "completed").then((jobs) => deleted.push(...jobs));
  await mentionQueue.clean(ms("1 hour"), 1000, "completed").then((jobs) => deleted.push(...jobs));

  await dmQueue.clean(ms("1 hour"), 1000, "failed").then((jobs) => deleted.push(...jobs));
  await mentionQueue.clean(ms("1 hour"), 1000, "failed").then((jobs) => deleted.push(...jobs));

  if (deleted.length > 0) {
    logger.info(`queues: cleaned ${deleted.length} completed/failed jobs from queues`);
  }
}, ms("1 hour"));
