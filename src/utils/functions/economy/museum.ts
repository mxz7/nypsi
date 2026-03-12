import { Prisma } from "#generated/prisma";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { Item } from "../../../types/Economy";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getUserId, MemberResolvable } from "../member";
import { createUser, getItems, userExists } from "./utils";
import ms = require("ms");

export class Museum {
  private items: { [itemId: string]: { amount: number; completedAt: Date } };
  private userId: string;

  constructor(
    member: MemberResolvable,
    data?:
      | { [itemId: string]: { amount: number; completedAt: Date } }
      | { itemId: string; amount: number; completedAt: Date }[],
  ) {
    this.userId = getUserId(member);
    this.items = {};

    if (Array.isArray(data)) {
      for (const i of data) {
        this.items[i.itemId] = {
          amount: i.amount,
          completedAt: i.completedAt,
        };
      }
    } else if (data) {
      this.items = data;
    }
  }

  entries(): { itemId: string; amount: number; completedAt: Date }[] {
    return Object.entries(this.items).map(([item, data]) => ({
      itemId: item,
      amount: data.amount,
      completedAt: data.completedAt,
    }));
  }

  getItemsInCategory(category: string) {
    const items = getItems();

    return this.entries().filter((item) => items[item.itemId].museum?.category == category);
  }

  count(item: Item): number;
  count(itemId: string): number;
  count(item: Item | string): number {
    const itemId = typeof item === "string" ? item : item.id;
    return this.items[itemId]?.amount ?? 0;
  }

  has(item: Item): boolean;
  has(itemId: string): boolean;
  has(item: Item | string): boolean {
    const itemId = typeof item === "string" ? item : item.id;
    return (this.items[itemId]?.amount ?? 0) > 0;
  }

  completed(item: Item): boolean;
  completed(itemId: string): boolean;
  completed(item: Item | string): boolean {
    const itemId = typeof item === "string" ? item : item.id;
    return this.completedAt(itemId) != undefined;
  }

  completedAt(item: Item): Date;
  completedAt(itemId: string): Date;
  completedAt(item: Item | string): Date {
    const itemId = typeof item === "string" ? item : item.id;
    return this.items[itemId]?.completedAt;
  }

  async completedPlacement(item: Item): Promise<number>;
  async completedPlacement(itemId: string): Promise<number>;
  async completedPlacement(item: Item | string): Promise<number> {
    const itemId = typeof item === "string" ? item : item.id;
    if (!this.completed(itemId)) return undefined;

    const cache = await redis.get(
      `${Constants.redis.cache.economy.MUSEUM_COMPLETION_PLACEMENTS}:${this.userId}`,
    );
    if (cache) {
      const parsed: Record<string, number> = JSON.parse(cache);
      return parsed[itemId];
    }

    const completedItems = Object.entries(this.items)
      .filter(([_, item]) => item.completedAt)
      .map(([id]) => id);

    if (completedItems.length === 0) return null;

    const results = await prisma.$queryRaw<{ itemId: string; placement: number }[]>`
    SELECT "itemId", placement
    FROM (
      SELECT
        "itemId",
        "userId",
        ROW_NUMBER() OVER (
          PARTITION BY "itemId"
          ORDER BY "completedAt" ASC
        ) as placement
      FROM "Museum"
      WHERE "itemId" IN (${Prisma.join(completedItems)})
      AND "completedAt" IS NOT NULL
    ) ranked
    WHERE "userId" = ${this.userId};
    `;

    const placements: Record<string, number> = {};

    for (const row of results) {
      placements[row.itemId] = Number(row.placement);
    }

    await redis.set(
      `${Constants.redis.cache.economy.MUSEUM_COMPLETION_PLACEMENTS}:${this.userId}`,
      JSON.stringify(placements),
      "EX",
      ms("3 days") / 1000,
    );

    return placements[itemId];
  }

  async leaderboardPlacement(item: Item): Promise<number>;
  async leaderboardPlacement(itemId: string): Promise<number>;
  async leaderboardPlacement(item: Item | string): Promise<number> {
    const itemId = typeof item === "string" ? item : item.id;
    if (!this.completed(itemId)) return undefined;

    const cache = await redis.get(
      `${Constants.redis.cache.economy.MUSEUM_LEADERBOARD_PLACEMENTS}:${this.userId}`,
    );
    if (cache) {
      const parsed: Record<string, number> = JSON.parse(cache);
      return parsed[itemId];
    }

    const completedItems = Object.entries(this.items)
      .filter(([_, item]) => item.completedAt)
      .map(([id]) => id);

    if (completedItems.length === 0) return null;

    const results = await prisma.$queryRaw<{ itemId: string; placement: number }[]>`
    SELECT "itemId", placement
    FROM (
      SELECT
        "itemId",
        "userId",
        RANK() OVER (
          PARTITION BY "itemId"
          ORDER BY "amount" DESC
        ) as placement
      FROM "Museum"
      WHERE "itemId" IN (${Prisma.join(completedItems)})
      AND "completedAt" IS NOT NULL
    ) ranked
    WHERE "userId" = ${this.userId};
    `;

    const placements: Record<string, number> = {};

    for (const row of results) {
      placements[row.itemId] = Number(row.placement);
    }

    await redis.set(
      `${Constants.redis.cache.economy.MUSEUM_LEADERBOARD_PLACEMENTS}:${this.userId}`,
      JSON.stringify(placements),
      "EX",
      ms("1 day") / 1000,
    );

    return placements[itemId];
  }

  toJSON(): { [itemId: string]: { amount: number; completedAt: Date } } {
    return this.items;
  }
}

export async function getMuseum(member: MemberResolvable): Promise<Museum> {
  const userId = getUserId(member);

  const cache = await redis.get(`${Constants.redis.cache.economy.MUSEUM}:${userId}`);

  if (cache) {
    try {
      const parsed = JSON.parse(cache);
      return new Museum(member, parsed);
    } catch (e) {
      console.error(e);
      logger.error("weird museum cache error", { error: e });
      return new Museum(member);
    }
  }

  const query = await prisma.museum
    .findMany({
      where: {
        userId,
      },
      select: {
        itemId: true,
        amount: true,
        completedAt: true,
      },
    })
    .then((q) =>
      q.map((i) => {
        return { itemId: i.itemId, amount: Number(i.amount), completedAt: i.completedAt };
      }),
    )
    .catch(() => {});

  if (!query || query.length == 0) {
    if (!(await userExists(userId))) await createUser(userId);
    await redis.set(
      `${Constants.redis.cache.economy.MUSEUM}:${userId}`,
      JSON.stringify({}),
      "EX",
      180,
    );
    return new Museum(member);
  }

  const museum = new Museum(member, query);

  await redis.set(
    `${Constants.redis.cache.economy.MUSEUM}:${userId}`,
    JSON.stringify(museum.toJSON()),
    "EX",
    180,
  );

  return museum;
}

export async function addToMuseum(member: MemberResolvable, itemId: string, amount: number) {
  const userId = getUserId(member);

  if (amount <= 0) return;

  if (!(await userExists(userId))) await createUser(userId);

  const item = getItems()[itemId];

  if (!item || !item.museum) {
    console.trace();
    return logger.error(`invalid item for museum: ${itemId}`);
  }

  const res = await prisma.museum.upsert({
    where: {
      userId_itemId: {
        userId,
        itemId,
      },
    },
    update: {
      amount: { increment: amount },
    },
    create: {
      userId,
      itemId,
      amount: amount,
    },
    select: {
      amount: true,
      completedAt: true,
    },
  });

  if (!res.completedAt && res.amount >= item.museum.threshold) {
    await prisma.museum.update({
      where: {
        userId_itemId: {
          userId,
          itemId,
        },
      },
      data: {
        completedAt: new Date(),
      },
    });
    await redis.del(`${Constants.redis.cache.economy.MUSEUM_COMPLETION_PLACEMENTS}:${userId}`);
  }

  await redis.del(
    `${Constants.redis.cache.economy.MUSEUM}:${userId}`,
    `${Constants.redis.cache.economy.MUSEUM_LEADERBOARD_PLACEMENTS}:${userId}`,
  );
}
