import { CarUpgradeType } from "@prisma/client";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";

export type Car = {
  upgrades: {
    type: CarUpgradeType;
    amount: number;
  }[];
  name: string;
  id: string;
};

const carEmojis = new Map<number, string>();
carEmojis.set(0, "<:nypsi_car_0:1227982579139874896>");

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

  return { speed: Math.floor(base), turbo: Math.floor(turbo) };
}

export function getCarEmoji(car: Car) {
  const calc = calcSpeed(car);
  let speed = calc.speed + calc.turbo;

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
  let base = 75_000_000;

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
