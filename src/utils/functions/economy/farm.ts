import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import { addInventoryItem } from "./inventory";
import { getPlantsData } from "./utils";
import dayjs = require("dayjs");

export async function getFarm(member: GuildMember | string) {
  let id: string;
  if (typeof member === "string") id = member;
  else id = member.user.id;

  const query = await prisma.farm.findMany({
    where: {
      userId: id,
    },
    orderBy: {
      id: "asc",
    },
  });

  return query;
}

export async function addFarm(member: GuildMember | string, plantId: string, amount = 1) {
  let id: string;
  if (typeof member === "string") id = member;
  else id = member.user.id;

  await prisma.farm.createMany({
    data: new Array(amount).fill({ userId: id, plantId }),
  });
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
        { harvestedAt: { lt: dayjs().subtract(1, "hours").toDate() } },
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
  }

  let items = 0;
  let weed = 0;
  for (const plant of plants) {
    const start = Math.max(0, Date.now() - plant.harvestedAt.getTime());
    const hours = start / 3600000; // hours - chatgpt
    const earned = Math.max(0, hours * plantData.hourly);
    if (earned > plantData.max) items += plantData.max;
    else items += earned;
    if (plantId === 'banana_tree' && Math.random() < 0.001) { // 0.1% chance
      weed++;
    }
  }

  items = Math.floor(items);
   if (claim && items > 0) {
    await addInventoryItem(id, plantData.item, items);

    if (weed > 0) {
        await addInventoryItem(id, "weed_seed", weed);
      }
    }

  return {items: items, extraItems: weed};
}
