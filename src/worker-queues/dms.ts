import { DiscordAPIError } from "@discordjs/rest";
import { Worker } from "bullmq";
import { Routes } from "discord-api-types/v10";
import "dotenv/config";
import Redis from "ioredis";
import ms from "ms";
import { DMJobData } from "../types/workers/dms";
import { MapCache } from "../utils/cache";
import { logger, setClusterId } from "../utils/logger";
import { getRest } from "../utils/rest";

process.title = "nypsi: worker-dms";

setClusterId("worker-dms");

const connection = new Redis({ maxRetriesPerRequest: null });
const rest = getRest();

const blocked = new MapCache<number>(ms("1 minute"));

type Result = "skipped - blocked" | "success";

const worker = new Worker<DMJobData, Result>(
  "dms",
  async (job) => {
    const { memberId, payload } = job.data;

    if (blocked.get(memberId)) {
      return "skipped - blocked";
    }

    let dmChannel: { id: string };

    try {
      dmChannel = (await rest.post(Routes.userChannels(), {
        body: { recipient_id: memberId },
      })) as { id: string };
    } catch (err) {
      if (err instanceof DiscordAPIError) {
        if (err.code === 50007) {
          // auto removed by mapcache
          blocked.set(memberId, 69);
          return "skipped - blocked";
        }
      }

      throw err;
    }

    await rest.post(Routes.channelMessages(dmChannel.id), {
      body: payload,
    });

    return "success";
  },
  {
    connection,
    concurrency: 3,
  },
);

worker.on("paused", () => {
  logger.info("queue paused");
});

worker.on("resumed", () => {
  logger.info("queue resumed");
});

worker.on("error", (err) => {
  logger.error("queue error", {
    name: err.name,
    message: err.message,
    stack: err.stack,
  });
});

worker.on("stalled", (jobId) => {
  logger.warn(`job stalled: ${jobId}`);
});

worker.on("completed", (job) => {
  logger.info(`::success dm: job completed: ${job.id} ${job.data.memberId}`, {
    status: job.returnvalue,
    payload: job.data.payload,
  });
});

worker.on("failed", (job, err) => {
  logger.error(`dm: job failed: ${job.id} ${job.data.memberId}`, {
    name: err.name,
    message: err.message,
    payload: job.data.payload,
  });
});

logger.info("online");
