import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { addInventoryItem } from "./inventory";
import { getPlantsData } from "./utils";
import dayjs = require("dayjs");
import ms = require("ms");

export async function getFarm(member: GuildMember | string) {
  let id: string;
  if (typeof member === "string") id = member;
  else id = member.user.id;

  const cache = await redis.get(`${Constants.redis.cache.economy.farm}:${id}`);

  if (cache) {
    return JSON.parse(cache);
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
