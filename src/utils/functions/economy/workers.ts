import { EconomyWorker, EconomyWorkerUpgrades } from "@prisma/client";
import { GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import { logger } from "../../logger";
import { randomRound } from "../random";
import { addProgress } from "./achievements";
import { addBalance } from "./balance";
import { getBoosters } from "./boosters";
import { addInventoryItem, gemBreak, getInventory } from "./inventory";
import { addStat } from "./stats";
import { getBaseUpgrades, getBaseWorkers, getItems } from "./utils";
import { Worker, WorkerByproducts } from "../../../types/Workers";

export async function getWorkers(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.economyWorker.findMany({
    where: {
      userId: id,
    },
    include: {
      upgrades: true,
    },
  });

  return query;
}

export async function getWorker(member: GuildMember | string, worker: Worker) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.economyWorker.findFirst({
    where: {
      userId: id,
      workerId: worker.id,
    },
    include: {
      upgrades: true,
    },
  });

  return query;
}

export async function addWorker(member: GuildMember, id: string) {
  let memberID: string;
  if (member instanceof GuildMember) {
    memberID = member.user.id;
  } else {
    memberID = member;
  }

  const baseWorkers = getBaseWorkers();

  if (!baseWorkers[id]) return logger.warn(`unknown worker: ${id}`);

  await prisma.economyWorker
    .create({
      data: {
        userId: memberID,
        workerId: id,
      },
    })
    .catch(() => {});
}

export async function emptyWorkersStored(member: GuildMember | string) {
  let memberID: string;
  if (member instanceof GuildMember) {
    memberID = member.user.id;
  } else {
    memberID = member;
  }

  await prisma.economyWorker.updateMany({
    where: {
      userId: memberID,
    },
    data: {
      stored: 0,
    },
  });
}

export async function calcWorkerValues(
  worker: EconomyWorker & {
    upgrades: EconomyWorkerUpgrades[];
  },
) {
  const baseUpgrades = getBaseUpgrades();
  const baseWorkers = getBaseWorkers();

  const inventory = await getInventory(worker.userId);
  const boosters = await getBoosters(worker.userId);
  const items = getItems();

  let perIntervalBonus = 0;
  let perItemBonus = 0;
  let maxStoredBonus = 0;
  const byproductChances = {} as {
    [item: string]: {
      chance: number;
      rolls: number;
    };
  };

  const baseByproducts = baseWorkers[worker.workerId].base.byproducts;
  for (const byproduct in baseByproducts) {
    byproductChances[byproduct] = {
      chance: baseByproducts[byproduct].chance,
      rolls: baseByproducts[byproduct].rolls,
    };
  }

  for (const upgrade of worker.upgrades) {
    switch (baseUpgrades[upgrade.upgradeId].upgrades) {
      case "per_item":
        perItemBonus +=
          baseUpgrades[upgrade.upgradeId].effect *
          upgrade.amount *
          baseWorkers[worker.workerId].base.per_item;
        break;
      case "per_interval":
        perIntervalBonus +=
          baseUpgrades[upgrade.upgradeId].effect *
          upgrade.amount *
          baseWorkers[worker.workerId].base.per_interval;
        break;
      case "max_storage":
        maxStoredBonus +=
          baseUpgrades[upgrade.upgradeId].effect *
          upgrade.amount *
          baseWorkers[worker.workerId].base.max_storage;
        break;
      case "byproduct_chance":
        byproductChances[baseUpgrades[upgrade.upgradeId].byproduct].chance +=
          baseUpgrades[upgrade.upgradeId].effect * upgrade.amount;
        break;
      case "byproduct_rolls":
        byproductChances[baseUpgrades[upgrade.upgradeId].byproduct].rolls +=
          baseUpgrades[upgrade.upgradeId].effect * upgrade.amount;
        break;
    }
  }

  for (const boosterId of boosters.keys()) {
    if (items[boosterId].role != "booster") continue;

    switch (items[boosterId].boosterEffect.boosts[0]) {
      case "per_interval":
        perIntervalBonus +=
          items[boosterId].boosterEffect.effect *
          boosters.get(boosterId).length *
          (perIntervalBonus + baseWorkers[worker.workerId].base.per_interval);
        break;
    }
  }

  let heart = false;
  if (inventory.find((i) => i.item === "crystal_heart")?.amount > 0) heart = true;

  if (inventory.find((i) => i.item == "purple_gem")?.amount > 0) {
    const chance = Math.floor(Math.random() * 10);

    if (chance < 5 && !heart) {
      perItemBonus -= perItemBonus * 0.17;
    } else {
      gemBreak(worker.userId, 0.01, "purple_gem");
      perItemBonus += perItemBonus * 0.17;
    }
  }

  if (inventory.find((i) => i.item == "green_gem")?.amount > 0) {
    maxStoredBonus += maxStoredBonus * 0.2;
  }

  if (inventory.find((i) => i.item == "blue_gem")?.amount > 0) {
    const chance = Math.floor(Math.random() * 10);

    if (chance < 4 && !heart) {
      perIntervalBonus -= perIntervalBonus * 0.2;
    } else {
      gemBreak(worker.userId, 0.01, "blue_gem");
      perIntervalBonus += perIntervalBonus * 0.17;
    }
  }

  if (inventory.find((i) => i.item == "white_gem")?.amount > 0) {
    const chance = Math.floor(Math.random() * 10);

    if (chance < 4 && !heart) {
      perIntervalBonus -= perIntervalBonus * 0.5;
      perItemBonus -= perItemBonus * 0.5;
    } else {
      gemBreak(worker.userId, 0.005, "white_gem");
      perIntervalBonus += perIntervalBonus * 0.7;
      perItemBonus += perItemBonus * 0.7;
    }

    maxStoredBonus += maxStoredBonus * 0.7;
  }

  return {
    perInterval: Math.max(
      0,
      Math.floor(baseWorkers[worker.workerId].base.per_interval + perIntervalBonus),
    ),
    perItem: Math.max(0, Math.floor(baseWorkers[worker.workerId].base.per_item + perItemBonus)),
    maxStorage: Math.max(
      0,
      Math.floor(baseWorkers[worker.workerId].base.max_storage + maxStoredBonus),
    ),
    byproductChances,
  };
}

export async function addWorkerUpgrade(
  member: GuildMember,
  workerId: string,
  upgradeId: string,
  amount = 1,
) {
  await prisma.economyWorkerUpgrades.upsert({
    where: {
      userId_workerId_upgradeId: {
        upgradeId: upgradeId,
        userId: member.user.id,
        workerId: workerId,
      },
    },
    update: {
      amount: { increment: amount },
    },
    create: {
      upgradeId: upgradeId,
      userId: member.user.id,
      workerId: workerId,
      amount,
    },
  });
}

export async function evaluateWorker(
  userId: string,
  worker: Worker,
  options: {
    stored?: number;
    calculated?: {
      perItem: number;
      byproductChances: {
        [item: string]: {
          chance: number;
          rolls: number;
        };
      };
    };
  },
) {
  let userWorker = undefined;
  let stored = options.stored;
  if (stored === undefined) {
    // be lazy in getting the user worker, because it might not be needed
    userWorker = await getWorker(userId, worker);
    stored = userWorker.stored;
  }

  if (stored == 0) return { amountEarned: 0, byproductAmounts: {} as WorkerByproducts };

  let perItem = options.calculated?.perItem;
  let byproductChances = options.calculated?.byproductChances;
  if (options.calculated === undefined) {
    // be lazy in getting the user worker, because it might not be needed
    if (userWorker === undefined) userWorker = await getWorker(userId, worker);
    ({ perItem, byproductChances } = await calcWorkerValues(userWorker));
  }

  const byproductAmounts = {} as WorkerByproducts;

  for (const byproduct in byproductChances) {
    byproductChances[byproduct].chance *= worker.base.byproducts[byproduct].multiply_chance
      ? stored
      : 1;
    byproductChances[byproduct].rolls *= worker.base.byproducts[byproduct].multiply_rolls
      ? stored
      : 1;
    byproductChances[byproduct].rolls = randomRound(byproductChances[byproduct].rolls);
    byproductAmounts[byproduct] = 0;
    for (let i = 0; i < byproductChances[byproduct].rolls; i++) {
      byproductAmounts[byproduct] += randomRound(byproductChances[byproduct].chance);
    }
    if (byproductAmounts[byproduct] <= 0) delete byproductAmounts[byproduct];
  }

  return { amountEarned: Math.floor(perItem * stored), byproductAmounts };
}

export async function claimFromWorkers(userId: string): Promise<string> {
  const baseWorkers = getBaseWorkers();
  const userWorkers = await getWorkers(userId);
  const allItems = getItems();

  let totalAmountEarned = 0;
  const moneyAmounts = new Map<string, { money: number; info: string }>();
  const totalByproducts = new Map<string, number>();

  for (const worker of userWorkers) {
    const { amountEarned, byproductAmounts } = await evaluateWorker(
      userId,
      baseWorkers[worker.workerId],
      {
        stored: worker.stored,
      },
    );

    totalAmountEarned += amountEarned;

    const baseWorker = baseWorkers[worker.workerId];
    const infoLine = `${baseWorker.name} +$${Math.floor(
      amountEarned,
    ).toLocaleString()} (${worker.stored.toLocaleString()} ${baseWorker.item_emoji})`;
    if (worker.stored > 0) {
      moneyAmounts.set(worker.workerId, { money: amountEarned, info: infoLine });
    }

    for (const byproduct in byproductAmounts) {
      totalByproducts.set(
        byproduct,
        (totalByproducts.has(byproduct) ? totalByproducts.get(byproduct) : 0) +
          byproductAmounts[byproduct],
      );
      await addInventoryItem(worker.userId, byproduct, byproductAmounts[byproduct]);
    }
  }

  if (totalAmountEarned == 0 && totalByproducts.size == 0) {
    return "you have no money to claim from your workers";
  }

  await emptyWorkersStored(userId);
  await addBalance(userId, totalAmountEarned);
  await addProgress(userId, "capitalist", totalAmountEarned);
  await addProgress(userId, "super_capitalist", totalAmountEarned);
  await addStat(userId, "earned-workers", totalAmountEarned);

  const workers = moneyAmounts.keys().toArray();
  const byproducts = totalByproducts.keys().toArray();
  inPlaceSort(workers).desc((x) => moneyAmounts.get(x).money);
  inPlaceSort(byproducts).asc((x) => totalByproducts.get(x));

  return (
    `+$**${totalAmountEarned.toLocaleString()}**\n\n` +
    `${workers.map((x) => moneyAmounts.get(x).info).join("\n")}` +
    (byproducts.length == 0
      ? ""
      : `\n\n${byproducts
          .map(
            (x) =>
              `you found **${totalByproducts.get(x)}** ${allItems[x].emoji} ${
                totalByproducts.get(x) > 1 ? allItems[x].plural : allItems[x].name
              }`,
          )
          .join("\n")}`)
  );
}
