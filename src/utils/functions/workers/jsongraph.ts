import dayjs = require("dayjs");
import { inPlaceSort } from "fast-sort";
import { isMainThread, parentPort, Worker, workerData } from "worker_threads";
import prisma from "../../../init/database";
import { ChartData } from "../../../types/Chart";

export default function getJsonGraphData(category: string): Promise<ChartData> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: category,
    });
    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

if (!isMainThread) {
  process.title = "nypsi: create json graph";

  const createGraphData = async (data: { userId: string; value: bigint | number; date: Date }[]): Promise<ChartData> => {
    const dates: number[] = [];
    const map = new Map<string, { value: number; date: number }[]>();

    for (const user of data) {
      if (!dates.includes(user.date.getTime())) dates.push(user.date.getTime());
      if (map.has(user.userId)) {
        map.get(user.userId).push({ value: Number(user.value), date: user.date.getTime() });
      } else {
        map.set(user.userId, [{ value: Number(user.value), date: user.date.getTime() }]);
      }
    }

    inPlaceSort(dates).asc();

    const users = new Map<string, string[]>();

    for (const date of dates) {
      for (const [userId, values] of map.entries()) {
        if (values.find((v) => v.date === date)) {
          const balance = values.find((v) => v.date === date).value;

          if (!users.has(userId)) {
            users.set(userId, [balance.toString()]);
          } else {
            users.get(userId).push(balance.toString());
          }
        } else {
          if (!users.has(userId)) {
            users.set(userId, ["0"]);
          } else {
            users.get(userId).push("0");
          }
        }
      }
    }

    const chart: ChartData = {
      type: "line",
      data: {
        labels: dates.map((d) => dayjs(d).format("YYYY-MM-DD")),
        datasets: [],
      },
    };

    for (const [userId, balances] of users.entries()) {
      const tag = await prisma.user
        .findUnique({
          where: {
            id: userId,
          },
          select: {
            lastKnownTag: true,
          },
        })
        .then((r) => r?.lastKnownTag);

      chart.data.datasets.push({ label: tag || userId, data: balances.map((b) => parseInt(b)), fill: false });
    }

    return chart;
  };

  (async () => {
    const data = await createGraphData(
      await prisma.graphMetrics.findMany({
        where: {
          category: workerData,
        },
        select: {
          date: true,
          userId: true,
          value: true,
        },
        orderBy: {
          date: "desc",
        },
      })
    );
    parentPort.postMessage(data);
    process.exit(0);
  })();
}
