import { inPlaceSort } from "fast-sort";
import { isMainThread, parentPort, Worker, workerData } from "worker_threads";

export default function workerSort<T>(
  data: T[],
  sortFunction: keyof T,
  direction: "asc" | "desc",
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: [data, sortFunction, direction],
    });
    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

if (!isMainThread) {
  process.title = "nypsi: sort worker";
  const data: any[] = workerData[0];
  const key: string = workerData[1];
  const direction: "asc" | "desc" = workerData[2];

  if (direction === "asc") {
    inPlaceSort(data).asc((i) => i[key]);
  } else {
    inPlaceSort(data).desc((i) => i[key]);
  }

  parentPort.postMessage(data);
  process.exit(0);
}
