import { GuildMember } from "discord.js";
import { sort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { addProgress } from "./achievements";
import { addInventoryItem, getInventory, removeInventoryItem } from "./inventory";
import { getPlantsData, getPlantUpgrades, getUpgradesData } from "./utils";
import dayjs = require("dayjs");
import ms = require("ms");

export async function getFarm(member: GuildMember | string) {
  let id: string;
  if (typeof member === "string") id = member;
  else id = member.user.id;

  const cache = await redis.get(`${Constants.redis.cache.economy.farm}:${id}`);

  if (cache) {
    return (
      JSON.parse(cache) as {
        id: number;
        userId: string;
        plantId: string;
        plantedAt: Date;
        harvestedAt: Date;
        wateredAt: Date;
        fertilisedAt: Date;
      }[]
    ).map((i) => {
      i.plantedAt = new Date(i.plantedAt);
      i.harvestedAt = new Date(i.harvestedAt);
      i.wateredAt = new Date(i.wateredAt);
      i.fertilisedAt = new Date(i.fertilisedAt);
      return i;
    });
  }

  const query = await prisma.farm.findMany({
    where: {
      userId: id,
    },
    orderBy: {
      id: "asc",
    },
  });

  await redis.set(
    `${Constants.redis.cache.economy.farm}:${id}`,
    JSON.stringify(query),
    "EX",
    Math.floor(ms("3 hour") / 1000),
  );

  return query;
}

export async function getFarmUpgrades(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const cache = await redis.get(`${Constants.redis.cache.economy.farmUpgrades}:${id}`);

  if (cache) {
    return JSON.parse(cache) as {
      userId: string;
      plantId: string;
      upgradeId: string;
      amount: number;
    }[];
  }

  const query = await prisma.farmUpgrades.findMany({
    where: {
      userId: id,
    },
  });

  await redis.set(
    `${Constants.redis.cache.economy.farmUpgrades}:${id}`,
    JSON.stringify(query),
    "EX",
    Math.floor(ms("3 hour") / 1000),
  );

  return query;
}

export async function addFarmUpgrade(
  member: GuildMember,
  plantId: string,
  upgradeId: string,
  amount = 1,
) {
  await prisma.farmUpgrades.upsert({
    where: {
      userId_plantId_upgradeId: {
        upgradeId: upgradeId,
        userId: member.user.id,
        plantId: plantId,
      },
    },
    update: {
      amount: { increment: amount },
    },
    create: {
      upgradeId: upgradeId,
      userId: member.user.id,
      plantId: plantId,
      amount,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.farmUpgrades}:${member.user.id}`);
}

export async function addFarm(member: GuildMember | string, plantId: string, amount = 1) {
  let id: string;
  if (typeof member === "string") id = member;
  else id = member.user.id;

  await prisma.farm.createMany({
    data: new Array(amount).fill({ userId: id, plantId }),
  });
  await redis.del(`${Constants.redis.cache.economy.farm}:${id}`);
}

export async function getClaimable(member: GuildMember | string, plantId: string, claim: boolean) {
  let id: string;
  if (typeof member === "string") id = member;
  else id = member.user.id;

  const inventory = await getInventory(member);
  const farm = await getFarm(id);
  const plantData = getPlantsData()[plantId];

  const growthTime = dayjs().subtract(plantData.growthTime, "seconds").valueOf();
  const hourlyTime = dayjs()
    .subtract(60 / plantData.hourly, "minutes")
    .valueOf();
  const waterTime = dayjs()
    .subtract(plantData.water.every * 1.5, "seconds")
    .valueOf();
  const fertiliseTime = dayjs()
    .subtract(plantData.fertilise.every * 1.5, "seconds")
    .valueOf();

  const plants = farm.filter(
    (plant) =>
      plant.plantId === plantId &&
      plant.plantedAt.valueOf() < growthTime &&
      plant.harvestedAt.valueOf() < hourlyTime &&
      plant.wateredAt.valueOf() > waterTime &&
      plant.fertilisedAt.valueOf() > fertiliseTime,
  );

  if (plants.length === 0) return 0;

  if (claim) {
    await prisma.farm.updateMany({
      where: {
        id: { in: plants.map((i) => i.id) },
      },
      data: {
        harvestedAt: new Date(),
      },
    });

    await redis.del(`${Constants.redis.cache.economy.farm}:${id}`);
  }

  let items = 0;

  const upgrades = getPlantUpgrades();
  const userUpgrades = await getFarmUpgrades(id);

  for (const plant of plants) {
    const start = Date.now() - plant.harvestedAt.getTime();
    let hours = start / 3600000; // hours - chatgpt

    let intervalMulti = 1;

    for (const upgradeId of Object.keys(upgrades).filter(
      (u) => upgrades[u].upgrades === "interval",
    )) {
      intervalMulti +=
        upgrades[upgradeId].effect *
          userUpgrades.find((u) => u.upgradeId == upgradeId && u.plantId === plant.plantId)
            ?.amount || 0;
    }

    hours *= intervalMulti;

    if (inventory.find((i) => i.item === "pink_gem")) {
      const chance = Math.floor(Math.random() * 10);
      if (chance < 3) {
        hours *= 0.8;
      } else {
        hours *= 1.25;
      }
    }

    const earned = hours * plantData.hourly;

    const prestigeUpgrade = userUpgrades.find((u) => u.upgradeId === "farm_output");
    let outputMulti = 1;

    if (prestigeUpgrade) {
      outputMulti += prestigeUpgrade.amount * getUpgradesData()[prestigeUpgrade.upgradeId].effect;
    }

    let storageMulti = 1;

    for (const upgradeId of Object.keys(upgrades).filter(
      (u) => upgrades[u].upgrades === "max_storage",
    )) {
      storageMulti +=
        upgrades[upgradeId].effect *
          userUpgrades.find((u) => u.upgradeId == upgradeId && u.plantId === plant.plantId)
            ?.amount || 0;
    }

    if (inventory.find((i) => i.item === "green_gem")) {
      storageMulti += 0.2;
    }

    if (
      inventory.find((i) => i.item === "pink_gem") &&
      inventory.find((i) => i.item === "purple_gem")
    ) {
      storageMulti += 0.2;
    }

    const adjustedEarned = earned * outputMulti;

    if (adjustedEarned > plantData.max) items += Math.floor(plantData.max * storageMulti);
    else items += Math.floor(adjustedEarned * storageMulti);
  }

  items = Math.floor(items);

  if (claim && items > 0) {
    await addInventoryItem(id, plantData.item, items);
    await addProgress(id, "green_fingers", items);
  }

  return items;
}

export async function deletePlant(id: number) {
  await prisma.farm.delete({
    where: {
      id,
    },
  });
}

async function checkDead(userId: string, plantId?: string) {
  const farm = await getFarm(userId);
  let count = 0;

  for (const plant of farm) {
    if (plantId && plant.plantId !== plantId) continue;

    if (
      plant.fertilisedAt.valueOf() <
        Date.now() - getPlantsData()[plant.plantId].fertilise.dead * 1000 ||
      plant.wateredAt.valueOf() < Date.now() - getPlantsData()[plant.plantId].water.dead * 1000
    ) {
      await deletePlant(plant.id);
      count++;
    }
  }

  if (count > 0) await redis.del(`${Constants.redis.cache.economy.farm}:${userId}`);

  return count;
}

export async function waterFarm(userId: string) {
  const dead = await checkDead(userId);

  const farm = await getFarm(userId);

  const toWater: number[] = [];

  for (const plant of farm) {
    if (
      plant.wateredAt.valueOf() <
      Date.now() - getPlantsData()[plant.plantId].water.every * 1000
    ) {
      toWater.push(plant.id);
    }
  }

  await prisma.farm.updateMany({
    where: {
      id: { in: toWater },
    },
    data: {
      wateredAt: new Date(),
    },
  });
  await redis.del(`${Constants.redis.cache.economy.farm}:${userId}`);

  return { count: toWater.length, dead };
}

export async function fertiliseFarm(userId: string): Promise<{
  dead?: number;
  msg?: "no fertiliser" | "no need";
  done?: number;
}> {
  const dead = await checkDead(userId);

  const [farm, inventory] = await Promise.all([getFarm(userId), getInventory(userId)]);

  const fertiliser = inventory.find((i) => i.item === "fertiliser");

  if (!fertiliser || fertiliser.amount <= 0) return { dead, msg: "no fertiliser" };

  let possible = sort(
    farm.filter(
      (i) =>
        i.fertilisedAt.valueOf() <
        dayjs().subtract(getPlantsData()[i.plantId].fertilise.every, "seconds").valueOf(),
    ),
  ).asc((i) => {
    const timeTillDead =
      new Date(i.fertilisedAt).getTime() +
      getPlantsData()[i.plantId].fertilise.dead * 1000 -
      Date.now();

    return timeTillDead;
  });

  if (possible.length === 0) return { dead, msg: "no need" };

  if (possible.length > fertiliser.amount * 3) possible = possible.slice(0, fertiliser.amount * 3);

  await prisma.farm.updateMany({
    where: {
      id: { in: possible.map((i) => i.id) },
    },
    data: {
      fertilisedAt: new Date(),
    },
  });

  await removeInventoryItem(userId, fertiliser.item, Math.ceil(possible.length / 3));
  await redis.del(`${Constants.redis.cache.economy.farm}:${userId}`);

  return { done: possible.length, dead };
}
