import { isMainThread, Worker, workerData } from "worker_threads";

export default function processEvidence(file: File, key: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: [file, key],
    });
    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

if (!isMainThread) {
  process.title = "nypsi: evidence worker";
  const file: File = workerData[0];
  const key: string = workerData[1];

  console.log(file);
  console.log(key);

  // parentPort.postMessage(arr);
  process.exit(0);
}
