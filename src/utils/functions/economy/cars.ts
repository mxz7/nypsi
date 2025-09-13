import { CarUpgradeType } from "@generated/prisma";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { getInventory } from "./inventory";
import { getItems } from "./utils";

export type Car = {
  upgrades: {
    type: CarUpgradeType;
    amount: number;
  }[];
  name: string;
  id: number;
  skin?: string;
};

const carEmojis = new Map<number, string>();
carEmojis.set(0, "<:nypsi_car_0:1227982579139874896>");
carEmojis.set(5, "<:nypsi_i20n:1228692848900050944>");
carEmojis.set(8, "<:nypsi_octaviavrs:1228693886193369120>");
carEmojis.set(11, "<:nypsi_rs3:1228694189345210430>");
carEmojis.set(13, "<:nypsi_c63:1228703330193248326>");
carEmojis.set(15, "<:nypsi_m5:1228703019885924453>");
carEmojis.set(17, "<:nypsi_pinkporsche:1228700212835647589>");
carEmojis.set(20, "<:nypsi_db11:1228708967769702401>");
carEmojis.set(22, "<:nypsi_lambo:1207439589011357796>");
carEmojis.set(25, "<:nypsi_812:1228709501771841558>");

export async function checkSkins(member: MemberResolvable, cars: Car[]) {
  const inventory = await getInventory(member);

  let changed = false;
  const counts = new Map<string, number>();

  for (const car of cars) {
    if (car.skin) {
      if (counts.has(car.skin)) counts.set(car.skin, counts.get(car.skin) + 1);
      else counts.set(car.skin, 1);

      if (inventory.count(car.skin) < counts.get(car.skin)) {
        await setSkin(member, car.id);
        changed = true;
      }
    }
  }

  return changed;
}

export async function getGarage(member: MemberResolvable) {
  const userId = getUserId(member);

  const cache = await redis.get(`${Constants.redis.cache.economy.GARAGE}:${userId}`);

  if (cache) {
    checkSkins(userId, JSON.parse(cache));
    return JSON.parse(cache) as Car[];
  }

  const query = await prisma.customCar.findMany({
    where: {
      userId,
    },
    select: {
      upgrades: {
        select: {
          amount: true,
          type: true,
        },
      },
      name: true,
      id: true,
      skin: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  await redis.set(
    `${Constants.redis.cache.economy.GARAGE}:${userId}`,
    JSON.stringify(query),
    "EX",
    86400,
  );

  checkSkins(userId, query);

  return query;
}

export function calcSpeed(car: Car) {
  let base = 5;
  const max = base * 1.3 + (car.upgrades.find((i) => i.type === "wheel")?.amount || 0) * 1.75;
  const turbo = car.upgrades.find((i) => i.type === "turbo")?.amount || 0;

  base += (car.upgrades.find((i) => i.type === "engine")?.amount || 0) * 1.5;
  if (base > max) base = max;

  return Math.floor(base + turbo);
}

export function getCarEmoji(car: Car) {
  if (car.skin) return getItems()[car.skin].emoji;

  let speed = calcSpeed(car);

  let emoji: string;

  while (!emoji) {
    speed--;

    emoji = carEmojis.get(speed);
  }

  return emoji;
}

export async function addCar(member: MemberResolvable) {
  const userId = getUserId(member);

  await prisma.customCar.create({
    data: {
      name: "custom car",
      userId,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.GARAGE}:${userId}`);
}

export async function addCarUpgrade(
  member: MemberResolvable,
  carId: number,
  upgradeType: CarUpgradeType,
) {
  const userId = getUserId(member);

  await prisma.carUpgrade.upsert({
    where: {
      carId_type: {
        carId,
        type: upgradeType,
      },
    },
    update: {
      amount: { increment: 1 },
    },
    create: {
      type: upgradeType,
      carId,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.GARAGE}:${userId}`);
}

export function calcCarCost(amount: number) {
  let base = 50_000_000;

  for (let i = 0; i < amount; i++) {
    base += 50_000_000;
  }

  return base;
}

export async function setCarName(member: MemberResolvable, carId: number, name: string) {
  const userId = getUserId(member);

  await prisma.customCar.update({
    where: {
      id: carId,
    },
    data: {
      name,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.GARAGE}:${userId}`);
}

export async function setSkin(member: MemberResolvable, carId: number, skin?: string) {
  await prisma.customCar.update({
    where: {
      id: carId,
    },
    data: {
      skin: skin || null,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.GARAGE}:${getUserId(member)}`);
}
