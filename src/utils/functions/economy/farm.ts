import { GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { addInventoryItem, getInventory, setInventoryItem } from "./inventory";
import { getPlantsData } from "./utils";
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

  const plantData = getPlantsData()[plantId];

  const plants = await prisma.farm.findMany({
    where: {
      AND: [
        { userId: id },
        { plantId },
        { plantedAt: { lt: dayjs().subtract(plantData.growthTime, "seconds").toDate() } },
        { harvestedAt: { lt: dayjs().subtract(1, "hour").toDate() } },
        { wateredAt: { gt: dayjs().subtract(plantData.water.every, "seconds").toDate() } },
        { fertilisedAt: { gt: dayjs().subtract(plantData.fertilise.every, "seconds").toDate() } },
      ],
    },
  });

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

  for (const plant of plants) {
    const start = Date.now() - plant.harvestedAt.getTime();
    const hours = start / 3600000; // hours - chatgpt
    const earned = hours * plantData.hourly;

    if (earned > plantData.max) items += plantData.max;
    else items += earned;
  }

  items = Math.floor(items);

  if (claim && items > 0) await addInventoryItem(id, plantData.item, items);

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

  await prisma.farm.updateMany({
    where: {
      userId,
    },
    data: {
      wateredAt: new Date(),
    },
  });
  await redis.del(`${Constants.redis.cache.economy.farm}:${userId}`);

  if (dead) return { dead };
}

export async function fertiliseFarm(
  userId: string,
): Promise<{ dead?: number; msg?: "not fertiliser"; done?: number }> {
  const dead = await checkDead(userId);

  const [farm, inventory] = await Promise.all([getFarm(userId), getInventory(userId)]);

  const fertiliser = inventory.find((i) => i.item === "fertiliser");

  if (!fertiliser || fertiliser.amount <= 0) return { dead, msg: "not fertiliser" };

  inPlaceSort(farm).asc((i) => {
    const timeTillDead =
      new Date(i.fertilisedAt).getTime() +
      getPlantsData()[i.plantId].fertilise.dead * 1000 -
      Date.now();

    return timeTillDead;
  });

  let possible = farm;

  if (possible.length > fertiliser.amount) possible = possible.slice(0, fertiliser.amount);

  for (const plant of possible) {
    prisma.farm.update({
      where: {
        id: plant.id,
      },
      data: {
        fertilisedAt: new Date(),
      },
    });
  }

  await setInventoryItem(userId, fertiliser.item, fertiliser.amount - possible.length);
  await redis.del(`${Constants.redis.cache.economy.farm}:${userId}`);

  return { done: possible.length, dead };
}
