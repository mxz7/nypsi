import { GuildMember } from "discord.js";
import { sort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { addProgress } from "./achievements";
import { addEventProgress } from "./events";
import { addInventoryItem, gemBreak, getInventory, removeInventoryItem } from "./inventory";
import { addStat } from "./stats";
import { getPlantsData, getPlantUpgrades, getUpgradesData } from "./utils";
import dayjs = require("dayjs");
import ms = require("ms");

export async function getFarm(member: MemberResolvable) {
  const userId = getUserId(member);

  const cache = await redis.get(`${Constants.redis.cache.economy.farm}:${userId}`);

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
      userId,
    },
    orderBy: {
      id: "asc",
    },
  });

  await redis.set(
    `${Constants.redis.cache.economy.farm}:${userId}`,
    JSON.stringify(query),
    "EX",
    Math.floor(ms("3 hour") / 1000),
  );

  return query;
}

export async function getFarmUpgrades(member: MemberResolvable) {
  const userId = getUserId(member);

  const cache = await redis.get(`${Constants.redis.cache.economy.farmUpgrades}:${userId}`);

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
      userId,
    },
  });

  await redis.set(
    `${Constants.redis.cache.economy.farmUpgrades}:${userId}`,
    JSON.stringify(query),
    "EX",
    Math.floor(ms("3 hour") / 1000),
  );

  return query;
}

export async function addFarmUpgrade(
  member: MemberResolvable,
  plantId: string,
  upgradeId: string,
  amount = 1,
) {
  const userId = getUserId(member);

  await prisma.farmUpgrades.upsert({
    where: {
      userId_plantId_upgradeId: {
        upgradeId: upgradeId,
        userId,
        plantId: plantId,
      },
    },
    update: {
      amount: { increment: amount },
    },
    create: {
      upgradeId: upgradeId,
      userId,
      plantId: plantId,
      amount,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.farmUpgrades}:${userId}`);
}

export async function addFarm(member: MemberResolvable, plantId: string, amount = 1) {
  const userId = getUserId(member);

  await prisma.farm.createMany({
    data: new Array(amount).fill({ userId, plantId }),
  });
  await redis.del(`${Constants.redis.cache.economy.farm}:${userId}`);
}

export function getClaimable(
  member: MemberResolvable,
  plantId: string,
  claim: true,
  client: NypsiClient,
): Promise<{ sold: number; eventProgress?: number }>;
export function getClaimable(
  member: MemberResolvable,
  plantId: string,
  claim: false,
): Promise<number>;
export async function getClaimable(
  member: MemberResolvable,
  plantId: string,
  claim: boolean,
  client?: NypsiClient,
): Promise<number | { sold: number; eventProgress?: number }> {
  const inventory = await getInventory(member);
  const farm = await getFarm(member);
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

    await redis.del(`${Constants.redis.cache.economy.farm}:${getUserId(member)}`);
  }

  let items = 0;

  const upgrades = getPlantUpgrades();
  const userUpgrades = await getFarmUpgrades(member);

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

    if ((await inventory.hasGem("pink_gem")).any) {
      const chance = Math.floor(Math.random() * 10);
      if (chance < 3) {
        hours *= 0.8;
      } else {
        hours *= 1.25;
        gemBreak(
          member,
          0.01,
          "pink_gem",
          member instanceof GuildMember && (member.client as NypsiClient),
        );
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

    if ((await inventory.hasGem("green_gem")).any) {
      storageMulti += 0.2;

      gemBreak(
        member,
        0.01,
        "green_gem",
        member instanceof GuildMember && (member.client as NypsiClient),
      );
    }

    if ((await inventory.hasGem("pink_gem")).any && (await inventory.hasGem("purple_gem")).any) {
      storageMulti += 0.2;

      gemBreak(
        member,
        0.005,
        "pink_gem",
        member instanceof GuildMember && (member.client as NypsiClient),
      );

      gemBreak(
        member,
        0.005,
        "purple_gem",
        member instanceof GuildMember && (member.client as NypsiClient),
      );
    }

    const adjustedEarned = earned * outputMulti;

    if (adjustedEarned > plantData.max) items += Math.floor(plantData.max * storageMulti);
    else items += Math.floor(adjustedEarned * storageMulti);
  }

  items = Math.floor(items);

  if (claim && items > 0) {
    await addInventoryItem(member, plantData.item, items);
    await addProgress(member, "green_fingers", items);
    const eventProgress = await addEventProgress(client, member, "farming", items);

    return { sold: items, eventProgress };
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

async function checkDead(member: MemberResolvable, plantId?: string) {
  const farm = await getFarm(member);
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

  if (count > 0) await redis.del(`${Constants.redis.cache.economy.farm}:${getUserId(member)}`);

  return count;
}

export async function waterFarm(member: MemberResolvable) {
  const dead = await checkDead(member);
  const farm = await getFarm(member);

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
  await redis.del(`${Constants.redis.cache.economy.farm}:${getUserId(member)}`);

  return { count: toWater.length, dead };
}

export async function fertiliseFarm(member: MemberResolvable): Promise<{
  dead?: number;
  msg?: "no fertiliser" | "no need";
  done?: number;
}> {
  const dead = await checkDead(member);

  const [farm, inventory] = await Promise.all([getFarm(member), getInventory(member)]);

  if (!inventory.has("fertiliser")) return { dead, msg: "no fertiliser" };

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

  if (possible.length > inventory.count("fertiliser") * 3)
    possible = possible.slice(0, inventory.count("fertiliser") * 3);

  await prisma.farm.updateMany({
    where: {
      id: { in: possible.map((i) => i.id) },
    },
    data: {
      fertilisedAt: new Date(),
    },
  });

  await removeInventoryItem(member, "fertiliser", Math.ceil(possible.length / 3));
  await addStat(member, "fertiliser", Math.ceil(possible.length / 3));
  await redis.del(`${Constants.redis.cache.economy.farm}:${getUserId(member)}`);

  return { done: possible.length, dead };
}
