import ms = require("ms");
import prisma from "../../database/database";
import { calcWorkerValues } from "../../functions/economy/workers";

async function doWorkerThing() {
  const query = await prisma.economyWorker.findMany({
    include: {
      upgrades: true,
    },
  });

  for (const worker of query) {
    const { maxStorage, perInterval } = await calcWorkerValues(worker);

    if (worker.stored >= maxStorage) continue;

    let incrementAmount = perInterval;

    if (worker.stored + incrementAmount > maxStorage) incrementAmount = maxStorage - worker.stored;

    await prisma.economyWorker.update({
      where: {
        userId_workerId: {
          userId: worker.userId,
          workerId: worker.workerId,
        },
      },
      data: {
        stored: {
          increment: incrementAmount,
        },
      },
    });
  }
}

export function runWorkerInterval() {
  setInterval(doWorkerThing, ms("1 minute"));
}
