import * as fs from "fs/promises";
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
    const resultsFile = `./temp/search_results_${Date.now()}.txt`;

    const logFiles = await fs.readdir("./out/logs").then((x) => x.filter((file) => file.includes(".log")));
    let resultsFound = 0;

    for (const fileName of logFiles) {
      const file = await fs.readFile(`./out/logs/${fileName}`).then((res) => res.toString().split("\n"));

      for (const line of file) {
        if (line.toLowerCase().includes(searchTerm.toLowerCase())) {
          await fs.appendFile(resultsFile, `${fileName}: ${line}\n`);
          resultsFound++;
        }
      }
    }

    const buffer = await fs.readFile(resultsFile);

    await fs.unlink(resultsFile);

    if (buffer) {
      parentPort.postMessage([buffer, resultsFound]);
    }

    process.exit(0);
  })();
}
