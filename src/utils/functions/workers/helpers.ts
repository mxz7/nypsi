import { Worker } from "bullmq";
import { logger } from "../../logger";

export function applyLogs(worker: Worker, key: string) {
  worker.on("paused", () => {
    logger.info(`${key} queue paused`);
  });

  worker.on("resumed", () => {
    logger.info(`${key} queue resumed`);
  });

  worker.on("error", (err) => {
    logger.info(`${key} queue error`, { name: err.name, message: err.message });
  });

  worker.on("stalled", (jobId) => {
    logger.info(`${key} job stalled: ${jobId}`);
  });

  worker.on("completed", (job) => {
    logger.info(`::success ${key} job completed: ${job.id} ${job.data.memberId}`, {
      payload: job.data.payload,
    });
  });

  worker.on("failed", (job, err) => {
    logger.error(`${key} job failed: ${job.id} ${job.data.memberId}`, {
      name: err.name,
      message: err.message,
      payload: job.data.payload,
    });
  });

  worker.on("active", (job) => {
    logger.info(`${key} job active: ${job.id} ${job.data.memberId}`);
  });
}
