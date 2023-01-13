import { exec } from "child_process";
import { inPlaceSort } from "fast-sort";
import * as fs from "fs/promises";
import { promisify } from "util";
import { isMainThread, parentPort, Worker, workerData } from "worker_threads";
import dayjs = require("dayjs");

export default function searchLogs(searchTerm: string): Promise<[Buffer, number]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: [searchTerm],
    });
    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

if (!isMainThread) {
  process.title = "nypsi: logsearch worker";
  (async () => {
    const searchTerm: string = workerData[0];
    const resultsFile = `temp/search_results_${Date.now()}.txt`;

    const execCmd = promisify(exec);
    await execCmd(`grep -rh "${searchTerm}" out/logs > ${resultsFile}`);

    const buffer = await fs.readFile(resultsFile);
    const values = buffer.toString().split("\n");

    inPlaceSort(values).desc((i) => {
      try {
        const timestamp: string = JSON.parse(i.substring(i.length - 30)).timestamp;

        const date = dayjs()
          .set("month", parseInt(timestamp.substring(3, 5)) - 1)
          .set("date", parseInt(timestamp.substring(0, 2)))
          .set("hour", parseInt(timestamp.split(":")[0].split(" ")[1]))
          .set("minute", parseInt(timestamp.split(":")[1]))
          .set("second", parseInt(timestamp.split(":")[2]));

        return date.unix();
      } catch {
        try {
          const timestamp: string = JSON.parse(i.substring(i.length - 35)).timestamp;

          const date = dayjs(timestamp);

          return date.unix();
        } catch {
          return null;
        }
      }
    });

    await fs.unlink(resultsFile);

    if (buffer) {
      parentPort.postMessage([values.join("\n"), buffer.toString().split("\n").length]);
    }

    process.exit(0);
  })();
}
