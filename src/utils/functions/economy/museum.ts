import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { Item } from "../../../types/Economy";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getUserId, MemberResolvable } from "../member";
import { createUser, getItems, userExists } from "./utils";

export class Museum {
  private items: { [itemId: string]: { amount: number; completedAt: Date } };

  constructor(
    data?:
      | { [itemId: string]: { amount: number; completedAt: Date } }
      | { item: string; amount: number; completedAt: Date }[],
  ) {
    this.items = {};

    if (Array.isArray(data)) {
      for (const i of data) {
        this.items[i.item] = {
          amount: i.amount,
          completedAt: i.completedAt,
        };
      }
    } else if (data) {
      this.items = data;
    }
  }

  entries(): { item: string; amount: number; completedAt: Date }[] {
    return Object.entries(this.items).map(([item, data]) => ({
      item,
      amount: data.amount,
      completedAt: data.completedAt,
    }));
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
    return Boolean(this.completedAt(itemId));
  }

  completedAt(item: Item): Date;
  completedAt(itemId: string): Date;
  completedAt(item: Item | string): Date {
    const itemId = typeof item === "string" ? item : item.id;
    return this.items[itemId]?.completedAt;
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
      return new Museum(parsed);
    } catch (e) {
      console.error(e);
      logger.error("weird museum cache error", { error: e });
      return new Museum();
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
        return { item: i.itemId, amount: Number(i.amount), completedAt: i.completedAt };
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
    return new Museum();
  }

  const museum = new Museum(query);

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

  if (!getItems()[itemId] || !getItems()[itemId].museum) {
    console.trace();
    return logger.error(`invalid item for museum: ${itemId}`);
  }

  await prisma.museum.upsert({
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
  });

  await redis.del(`${Constants.redis.cache.economy.MUSEUM}:${userId}`);
}
