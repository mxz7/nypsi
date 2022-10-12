import { GuildMember } from "discord.js";
import prisma from "../../database/database";
import { Worker, WorkerUpgrades } from "../../models/Workers";

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
