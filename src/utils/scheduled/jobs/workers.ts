import prisma from "../../database/database";
import { getBoosters } from "../../functions/economy/boosters";
import { getItems } from "../../functions/economy/utils";
import { getBaseUpgrades, getBaseWorkers } from "../../functions/economy/workers";
import { Booster } from "../../models/Economy";

(async () => {
  const query = await prisma.economyWorker.findMany({
    include: {
      upgrades: true,
    },
  });

  const boosters = new Map<string, Map<string, Booster[]>>();
  const baseWorkers = getBaseWorkers();
  const baseUpgrades = getBaseUpgrades();
  const items = getItems();

  const promises = [];

  for (const worker of query) {
    if (!boosters.has(worker.userId)) {
      boosters.set(worker.userId, await getBoosters(worker.userId));
    }

    const usersBoosters = boosters.get(worker.userId);

    let perIntervalBonus = 0;
    let maxStoredBonus = 0;

    for (const upgrade of worker.upgrades) {
      switch (baseUpgrades[upgrade.upgradeId].upgrades) {
        case 1:
          perIntervalBonus +=
            baseUpgrades[upgrade.upgradeId].effect * upgrade.amount * baseWorkers[worker.workerId].base.per_interval;
          break;
        case 2:
          maxStoredBonus +=
            baseUpgrades[upgrade.upgradeId].effect * upgrade.amount * baseWorkers[worker.workerId].base.max_storage;
          break;
      }
    }

    for (const boosterId of usersBoosters.keys()) {
      if (items[boosterId].role != "booster") return;

      switch (items[boosterId].boosterEffect.boosts[0]) {
        case "per_interval":
          perIntervalBonus +=
            items[boosterId].boosterEffect.effect *
            usersBoosters.get(boosterId).length *
            baseWorkers[worker.workerId].base.per_interval;
          break;
      }
    }

    const maxStorage = baseWorkers[worker.workerId].base.max_storage + maxStoredBonus;

    if (worker.stored >= maxStorage) continue;

    let incrementAmount = baseWorkers[worker.workerId].base.per_interval + perIntervalBonus;

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
