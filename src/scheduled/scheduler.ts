import { readdir } from "fs/promises";
import { CronJob } from "cron";
import { ClusterManager } from "discord-hybrid-sharding";
import { Job } from "../types/Jobs";
import { logger } from "../utils/logger";

const jobs = new Map<string, { job: CronJob; name: string; run: () => void }>();

export async function loadJobs(manager: ClusterManager) {
  for (const { job } of jobs.values()) {
    job.stop();
  }
  jobs.clear();
  const files = await readdir("dist/scheduled/jobs");

  for (const file of files) {
    delete require.cache[require.resolve(`./jobs/${file}`)];
    const imported = await import(`./jobs/${file}`).then((i) => i.default as Job);

    if (!imported) continue;

    const run = async () => {
      logger.info(`[${imported.name}] job started`);
      await imported.run(
        (message: string, data?: Record<any, any>) =>
          logger.info(`[${imported.name}] ${message}`, data),
        manager,
      );
      logger.info(`[${imported.name}] job finished`);
    };

    jobs.set(imported.name, {
      name: imported.name,
      job: new CronJob(imported.cron, run, null, true),
      run,
    });
  }

  logger.info(`${jobs.size} jobs loaded`);
}

export function runJob(job: string) {
  jobs.get(job)?.run();
}
