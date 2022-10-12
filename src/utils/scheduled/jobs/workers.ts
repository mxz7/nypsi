import prisma from "../../database/database";
import { calcWorkerValues } from "../../functions/economy/workers";

(async () => {
  const query = await prisma.economyWorker.findMany({
    include: {
      upgrades: true,
    },
  });

  const promises = [];

  for (const worker of query) {
    const { maxStorage, perInterval } = await calcWorkerValues(worker);

    if (worker.stored >= maxStorage) continue;

    let incrementAmount = perInterval;

    if (worker.stored + incrementAmount > maxStorage) incrementAmount = maxStorage - worker.stored;

    promises.push(
      prisma.economyWorker.update({
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
      })
    );
  }

  await Promise.all(promises);

  process.exit(0);
})();
