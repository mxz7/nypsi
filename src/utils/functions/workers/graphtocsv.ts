import dayjs = require("dayjs");
import { inPlaceSort } from "fast-sort";
import { appendFile, writeFile } from "fs/promises";
import { Worker, isMainThread, parentPort } from "worker_threads";
import prisma from "../../../init/database";

export default function graphToCsv(): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename);
    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

if (!isMainThread) {
  process.title = "nypsi: graph to csv";

  const toCsv = async (
    fileName: string,
    data: { userId: string; value: bigint | number; date: Date; id: bigint }[],
  ) => {
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

    const header: string[] = ["user"];

    header.push(...dates.map((d) => dayjs(d).format("YYYY-MM-DD")));

    await writeFile(`/tmp/${fileName}`, header.join(","));

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

    for (const [userId, balances] of users.entries()) {
      const tag = await prisma.user
        .findUnique({
          where: {
            id: userId,
          },
          select: {
            lastKnownUsername: true,
          },
        })
        .then((r) => r?.lastKnownUsername);

      await appendFile(
        `/tmp/${fileName}`,
        `\n${tag.replace(",", "") || userId},${balances.join(",")}`,
      );
    }
  };

  (async () => {
    await toCsv(
      "nypsi_topbalance.csv",
      await prisma.graphMetrics.findMany({
        where: {
          category: "balance",
        },
        orderBy: {
          date: "asc",
        },
      }),
    );

    await toCsv(
      "nypsi_topnetworth.csv",
      await prisma.graphMetrics.findMany({
        where: {
          category: "networth",
        },
        orderBy: {
          date: "asc",
        },
      }),
    );

    parentPort.postMessage(true);
    process.exit(0);
  })();
}
