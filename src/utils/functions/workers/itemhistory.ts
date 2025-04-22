import { inPlaceSort } from "fast-sort";
import { isMainThread, parentPort, Worker, workerData } from "worker_threads";
import prisma from "../../../init/database";
import { ChartData } from "../../../types/Chart";
import dayjs = require("dayjs");

export default function itemHistoryWorker(itemId: string): Promise<string> {
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
  process.title = "nypsi: item history worker";
  (async () => {
    const itemId: string = workerData[0];

    // const auctions = await prisma.auction.findMany({
    //   where: {
    //     AND: [{ itemId, sold: true }],
    //   },
    //   select: {
    //     bin: true,
    //     createdAt: true,
    //     itemAmount: true,
    //   },
    // });

    const offers = await prisma.offer.findMany({
      where: {
        AND: [{ itemId }, { sold: true }],
      },
    });

    const itemCount = await prisma.graphMetrics.findMany({
      where: {
        AND: [{ category: "item-count-" + itemId }, { userId: "global" }],
      },
    });

    // if (auctions.length < 2 && offers.length < 2 && itemCount.length < 2) {
    //   parentPort.postMessage(null);
    //   process.exit(0);
    // }

    // const auctionAverages = new Map<string, number[]>();

    // for (const item of auctions) {
    //   const date = dayjs(item.createdAt).format("YYYY-MM-DD");

    //   if (auctionAverages.has(date)) {
    //     auctionAverages.get(date).push(Number(item.bin / item.itemAmount));
    //   } else {
    //     auctionAverages.set(date, [Number(item.bin / item.itemAmount)]);
    //   }
    // }

    const offerAverages = new Map<string, number[]>();

    for (const item of offers) {
      const date = dayjs(item.soldAt).format("YYYY-MM-DD");

      if (offerAverages.has(date)) {
        offerAverages.get(date).push(Number(item.money / item.itemAmount));
      } else {
        offerAverages.set(date, [Number(item.money / item.itemAmount)]);
      }
    }

    const itemCounts = new Map<string, number>();

    for (const item of itemCount) {
      itemCounts.set(dayjs(item.date).format("YYYY-MM-DD"), Number(item.value));
    }

    const graphData: ChartData = {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            yAxisID: "y1",
            label: "auctions",
            data: [],
            fill: false,
            lineTension: 0.4,
          },
          {
            yAxisID: "y1",
            label: "offers",
            data: [],
            fill: false,
            lineTension: 0.4,
          },
          {
            yAxisID: "y2",
            label: "items in world",
            data: [],
            fill: true,
            lineTension: 0.4,
          },
        ],
      },
      options: {
        title: {
          display: true,
          text: `${itemId} history`,
        },
        elements: {
          point: {
            radius: 0,
          },
        },
        scales: {
          yAxes: [
            {
              id: "y1",
              display: true,
              position: "left",
              // stacked: true,
              gridLines: {
                display: true,
              },
              ticks: {
                min: 0,
              },
            },
            {
              id: "y2",
              display: true,
              position: "right",
              gridLines: {
                display: false,
              },
              ticks: {
                min: 0,
                callback(val) {
                  return Number(val).toLocaleString();
                },
              },
            },
          ],
        },
        plugins: {
          tickFormat: {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 0,
            //yAxisID: "y1",
          },
        },
      },
    };

    // for (const key of auctionAverages.keys()) {
    //   if (!graphData.data.labels.includes(dayjs(key).format("YYYY-MM-DD")))
    //     graphData.data.labels.push(dayjs(key).format("YYYY-MM-DD"));
    // }

    for (const key of offerAverages.keys()) {
      if (!graphData.data.labels.includes(dayjs(key).format("YYYY-MM-DD")))
        graphData.data.labels.push(dayjs(key).format("YYYY-MM-DD"));
    }

    for (const i of itemCount) {
      if (!graphData.data.labels.includes(dayjs(i.date).format("YYYY-MM-DD")))
        graphData.data.labels.push(dayjs(i.date).format("YYYY-MM-DD"));
    }

    inPlaceSort(graphData.data.labels).asc((i) => dayjs(i, "YYYY-MM-DD").unix());

    for (let i = 0; i < graphData.data.labels.length; i++) {
      if (!graphData.data.labels[i + 1]) break;

      const date1 = dayjs(graphData.data.labels[i], "YYYY-MM-DD");
      const date2 = dayjs(graphData.data.labels[i + 1], "YYYY-MM-DD");

      if (!date1.add(1, "day").isSame(date2)) {
        graphData.data.labels.splice(i + 1, 0, date1.add(1, "day").format("YYYY-MM-DD"));
      }
    }

    for (const dateString of graphData.data.labels) {
      const index = graphData.data.labels.indexOf(dateString);

      // if (auctionAverages.has(dateString)) {
      //   graphData.data.datasets[0].data.push(
      //     auctionAverages.get(dateString).reduce((a, b) => a + b) /
      //       auctionAverages.get(dateString).length,
      //   );
      // } else if (index > 0) {
      //   graphData.data.datasets[0].data.push(graphData.data.datasets[0].data[index - 1]);
      // } else {
      //   graphData.data.datasets[0].data.push(0);
      // }

      if (offerAverages.has(dateString)) {
        graphData.data.datasets[1].data.push(
          offerAverages.get(dateString).reduce((a, b) => a + b) /
            offerAverages.get(dateString).length,
        );
      } else if (index > 0) {
        graphData.data.datasets[1].data.push(graphData.data.datasets[1].data[index - 1]);
      } else {
        graphData.data.datasets[1].data.push(0);
      }

      if (itemCounts.has(dateString)) {
        graphData.data.datasets[2].data.push(itemCounts.get(dateString));
      } else if (index > 0) {
        graphData.data.datasets[2].data.push(graphData.data.datasets[2].data[index - 1]);
      } else {
        graphData.data.datasets[2].data.push(0);
      }
    }

    const body = JSON.stringify({ chart: graphData });

    const res: { success: boolean; url: string } = await fetch(
      "https://quickchart.io/chart/create",
      {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
      },
    ).then((res) => res.json());

    if (!res.success) {
      parentPort.postMessage(res);
      process.exit(0);
    }

    parentPort.postMessage(res.url);
    process.exit(0);
  })();
}
