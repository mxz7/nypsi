import { EconomyWorker, EconomyWorkerUpgrades } from "@prisma/client";
import { GuildMember } from "discord.js";
import prisma from "../../database/database";
import { logger } from "../../logger";
import { getBoosters } from "./boosters";
import { getBaseUpgrades, getBaseWorkers, getItems } from "./utils";

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
  }
) {
  const baseUpgrades = getBaseUpgrades();
  const baseWorkers = getBaseWorkers();

  const boosters = await getBoosters(worker.userId);
  const items = getItems();

  let perIntervalBonus = 0;
  let perItemBonus = 0;
  let maxStoredBonus = 0;

  for (const upgrade of worker.upgrades) {
    switch (baseUpgrades[upgrade.upgradeId].upgrades) {
      case 0:
        perItemBonus += baseUpgrades[upgrade.upgradeId].effect * upgrade.amount * baseWorkers[worker.workerId].base.per_item;
        break;
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

  for (const boosterId of boosters.keys()) {
    if (items[boosterId].role != "booster") return;

    switch (items[boosterId].boosterEffect.boosts[0]) {
      case "per_interval":
        perIntervalBonus +=
          items[boosterId].boosterEffect.effect *
          boosters.get(boosterId).length *
          (perIntervalBonus + baseWorkers[worker.workerId].base.per_interval);
        break;
    }
  }

  return {
    perInterval: Math.floor(baseWorkers[worker.workerId].base.per_interval + perIntervalBonus),
    perItem: Math.floor(baseWorkers[worker.workerId].base.per_item + perItemBonus),
    maxStorage: Math.floor(baseWorkers[worker.workerId].base.max_storage + maxStoredBonus),
  };
}

export async function addWorkerUpgrade(member: GuildMember, workerId: string, upgradeId: string) {
  await prisma.economyWorkerUpgrades.upsert({
    where: {
      userId_workerId_upgradeId: {
        upgradeId: upgradeId,
        userId: member.user.id,
        workerId: workerId,
      },
    },
    update: {
      amount: { increment: 1 },
    },
    create: {
      upgradeId: upgradeId,
      userId: member.user.id,
      workerId: workerId,
      amount: 1,
    },
  });
}
