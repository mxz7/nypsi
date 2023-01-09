import { exec } from "child_process";
import * as fs from "fs/promises";
import { promisify } from "util";
import { isMainThread, parentPort, Worker, workerData } from "worker_threads";

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
    await execCmd(`grep -rh ${searchTerm} out/logs > ${resultsFile}`);

    const buffer = await fs.readFile(resultsFile);

    await fs.unlink(resultsFile);

    if (buffer) {
      parentPort.postMessage([buffer, buffer.toString().split("\n").length]);
    }

    process.exit(0);
  })();
}
