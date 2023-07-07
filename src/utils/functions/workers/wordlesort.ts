import { inPlaceSort } from "fast-sort";
import { isMainThread, parentPort, Worker, workerData } from "worker_threads";

export default function wordleSortWorker(
  query: {
    user: {
      lastKnownTag: string;
      blacklisted: boolean;
      id: string;
    };
    win6: number;
    win5: number;
    win4: number;
    win3: number;
    win2: number;
    win1: number;
  }[],
): Promise<
  {
    wins: number;
    user: {
      lastKnownTag: string;
      blacklisted: boolean;
      id: string;
    };
  }[]
> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: [query],
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
  const query: {
    user: {
      lastKnownTag: string;
      blacklisted: boolean;
      id: string;
    };
    win6: number;
    win5: number;
    win4: number;
    win3: number;
    win2: number;
    win1: number;
  }[] = workerData[0];

  const data = query
    .filter((i) => !i.user.blacklisted)
    .map((i) => {
      return { wins: i.win1 + i.win2 + i.win3 + i.win4 + i.win5 + i.win6, user: i.user };
    });

  inPlaceSort(data).desc((i) => i.wins);

  parentPort.postMessage(data.slice(0, 100));
  process.exit(0);
}
