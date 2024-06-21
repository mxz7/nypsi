import { exec } from "child_process";
import { inPlaceSort } from "fast-sort";
import * as fs from "fs/promises";
import { promisify } from "util";
import { isMainThread, parentPort, Worker, workerData } from "worker_threads";
import dayjs = require("dayjs");

export default function searchLogs(searchTerm: string): Promise<string> {
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
    const resultsFile = `/tmp/nypsi_logsearch_results_${Date.now()}.txt`;

    const execCmd = promisify(exec);
    await execCmd(`grep -rh "${searchTerm}" out > ${resultsFile}`);

    const buffer = await fs.readFile(resultsFile);
    const values = buffer
      .toString()
      .split("\n")
      .map((i) => {
        try {
          const entry = JSON.parse(i);

          const newEntry = {
            date: dayjs(entry.time).format("YYYY-MM-DD HH:mm:ss.SSS"),
            msg: entry.msg.replace(/::\w+/gm, "").trim(),
            cluster: entry.cluster,
            time: entry.time,
          };

          delete entry.time;
          delete entry.cluster;
          delete entry.msg;

          for (const [k, v] of Object.entries(entry)) {
            // @ts-expect-error grrrrr
            newEntry[k] = v;
          }

          return JSON.stringify(newEntry);
        } catch {
          return null;
        }
      });

    inPlaceSort(values).desc((i) => {
      try {
        const timestamp: string = JSON.parse(i).time;

        const date = dayjs(timestamp);
        // .set("month", parseInt(timestamp.substring(3, 5)) - 1)
        // .set("date", parseInt(timestamp.substring(0, 2)))
        // .set("hour", parseInt(timestamp.split(":")[0].split(" ")[1]))
        // .set("minute", parseInt(timestamp.split(":")[1]))
        // .set("second", parseInt(timestamp.split(":")[2]));

        return date.toDate().getTime();
      } catch {
        try {
          const timestamp: string = JSON.parse(i.substring(i.length - 35)).timestamp;

          const date = dayjs(timestamp);

          return date.toDate().getTime();
        } catch {
          return null;
        }
      }
    });

    if (buffer) {
      const path = `/tmp/nypsi_logsearch_results_formatted_${Date.now()}.txt`;
      await fs.writeFile(path, buffer);

      parentPort.postMessage(path);
    }

    process.exit(0);
  })();
}
