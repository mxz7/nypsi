import { EconomyWorker, EconomyWorkerUpgrades } from "@prisma/client";
import { GuildMember } from "discord.js";
import prisma from "../../database/database";
import { Worker, WorkerUpgrades } from "../../models/Workers";
import { getBoosters } from "./boosters";
import { getItems } from "./utils";

declare function require(name: string): any;

const baseWorkers: { [key: string]: Worker } = require("../../../../data/workers.json").workers;
const baseUpgrades: { [key: string]: WorkerUpgrades } = require("../../../../data/workers.json").upgrades;

export function getBaseWorkers() {
  return baseWorkers;
}

export function getBaseUpgrades() {
  return baseUpgrades;
}

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

  await prisma.economyWorker.create({
    data: {
      userId: memberID,
      workerId: id,
    },
  });
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
          baseWorkers[worker.workerId].base.per_interval;
        break;
    }
  }

  return {
    perInterval: baseWorkers[worker.workerId].base.per_interval + perIntervalBonus,
    perItem: baseWorkers[worker.workerId].base.per_item + perItemBonus,
    maxStorage: baseWorkers[worker.workerId].base.max_storage + maxStoredBonus,
  };
}
