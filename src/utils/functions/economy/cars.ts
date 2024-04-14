import { CarUpgradeType } from "@prisma/client";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { getInventory } from "./inventory";
import { getItems } from "./utils";

export type Car = {
  upgrades: {
    type: CarUpgradeType;
    amount: number;
  }[];
  name: string;
  id: string;
  skin?: string;
};

const carEmojis = new Map<number, string>();
carEmojis.set(0, "<:nypsi_car_0:1227982579139874896>");
carEmojis.set(10, "<:nypsi_i20n:1228692848900050944>");
carEmojis.set(15, "<:nypsi_octaviavrs:1228693886193369120>");
carEmojis.set(20, "<:nypsi_rs3:1228694189345210430>");
carEmojis.set(25, "<:nypsi_c63:1228703330193248326>");
carEmojis.set(30, "<:nypsi_m5:1228703019885924453>");
carEmojis.set(35, "<:nypsi_pinkporsche:1228700212835647589>");
carEmojis.set(40, "<:nypsi_db11:1228708967769702401>");
carEmojis.set(45, "<:nypsi_812:1228709501771841558>");
carEmojis.set(50, "<:nypsi_lambo:1207439589011357796>");

export async function checkSkins(userId: string, cars: Car[]) {
  const inventory = await getInventory(userId);

  let changed = false;
  const counts = new Map<string, number>();

  for (const car of cars) {
    if (car.skin) {
      if (counts.has(car.skin)) counts.set(car.skin, counts.get(car.skin) + 1);
      else counts.set(car.skin, 1);

      const owned = inventory.find((i) => i.item === car.skin)?.amount || 0;

      if (owned < counts.get(car.skin)) {
        await setSkin(userId, car.id);
        changed = true;
      }
    }
  }

  return changed;
}

export async function getGarage(userId: string) {
  const cache = await redis.get(`${Constants.redis.cache.economy.GARAGE}:${userId}`);

  if (cache) {
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
      createdAt: "asc",
    },
  });

  await redis.set(
    `${Constants.redis.cache.economy.GARAGE}:${userId}`,
    JSON.stringify(query),
    "EX",
    86400,
  );

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

export async function addCar(userId: string) {
  await prisma.customCar.create({
    data: {
      name: "custom car",
      userId,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.GARAGE}:${userId}`);
}

export async function addCarUpgrade(userId: string, carId: string, upgradeType: CarUpgradeType) {
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

export async function setCarName(userId: string, carId: string, name: string) {
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

export async function setSkin(userId: string, carId: string, skin?: string) {
  await prisma.customCar.update({
    where: {
      id: carId,
    },
    data: {
      skin: skin || null,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.GARAGE}:${userId}`);
}
