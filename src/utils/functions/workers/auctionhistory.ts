import { inPlaceSort } from "fast-sort";
import { isMainThread, parentPort, Worker, workerData } from "worker_threads";
import prisma from "../../../init/database";
import { ChartData } from "../../../types/Chart";
import dayjs = require("dayjs");

export default function auctionHistoryWorker(itemId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: [itemId],
    });
    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

if (!isMainThread) {
  process.title = "nypsi: auction history worker";
  (async () => {
    const itemId: string = workerData[0];

    const query = await prisma.auction.findMany({
      where: {
        AND: [{ itemId, sold: true }],
      },
      select: {
        bin: true,
        createdAt: true,
        itemAmount: true,
      },
    });

    if (query.length < 1) {
      parentPort.postMessage(null);
      process.exit(0);
    }

    const gettingAverages = new Map<number, number[]>();

    for (const item of query) {
      item.createdAt = dayjs(item.createdAt)
        .set("hours", 0)
        .set("minutes", 0)
        .set("seconds", 0)
        .set("milliseconds", 0)
        .toDate();

      item.bin /= BigInt(item.itemAmount);

      if (gettingAverages.has(item.createdAt.getTime())) {
        gettingAverages.get(item.createdAt.getTime()).push(Number(item.bin));
      } else {
        gettingAverages.set(item.createdAt.getTime(), [Number(item.bin)]);
      }
    }

    const graphData: ChartData = {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: itemId,
            data: [],
          },
        ],
      },
      options: {
        elements: {
          point: {
            pointStyle: "line",
          },
        },
        plugins: {
          tickFormat: {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 0,
          },
        },
      },
    };

    for (const key of inPlaceSort(Array.from(gettingAverages.keys())).asc()) {
      graphData.data.labels.push(dayjs(key).format("YYYY-MM-DD"));
      graphData.data.datasets[0].data.push(
        gettingAverages.get(key).reduce((a, b) => a + b) / gettingAverages.get(key).length
      );
    }

    for (let i = 0; i < graphData.data.labels.length; i++) {
      // if (graphData.data.labels.length > 100) break;
      if (!graphData.data.labels[i + 1]) break;

      const date1 = dayjs(graphData.data.labels[i], "YYYY-MM-DD");
      const date2 = dayjs(graphData.data.labels[i + 1], "YYYY-MM-DD");

      if (!date1.add(1, "day").isSame(date2)) {
        graphData.data.labels.splice(i + 1, 0, date1.add(1, "day").format("YYYY-MM-DD"));
        graphData.data.datasets[0].data.splice(i + 1, 0, graphData.data.datasets[0].data[i]);
      }
    }

    const body = JSON.stringify({ chart: graphData });

    const res: { success: boolean; url: string } = await fetch("https://quickchart.io/chart/create", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    }).then((res) => res.json());

    if (!res.success) {
      parentPort.postMessage(res);
      process.exit(0);
    }

    parentPort.postMessage(res.url);
    process.exit(0);
  })();
}
