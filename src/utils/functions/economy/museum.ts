import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { Item } from "../../../types/Economy";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getUserId, MemberResolvable } from "../member";
import { createUser, getItems, userExists } from "./utils";

export class Museum {
  private items: { [itemId: string]: {amount: number; completed: boolean; completedAt: Date} };
  private userId: string;

  constructor(
    member: MemberResolvable,
    data?: { item: string; amount: number; completed: boolean; completedAt: Date }[],
  ) {
    this.userId = getUserId(member);
    this.items = {};

    if (Array.isArray(data)) {
      for (const i of data) {
        this.items[i.item] = {
            amount: i.amount,
            completed: i.completed,
            completedAt: i.completedAt
        };
      }
    }
  }

  get entries(): { item: string; amount: number; completed: boolean; completedAt: Date }[] {
    return Object.entries(this.items).map(([item, data]) => ({
      item,
      amount: data.amount,
      completed: data.completed,
      completedAt: data.completedAt
    }));
  }

  count(item: Item): number;
  count(itemId: string): number;
  count(item: Item | string): number {
    const itemId = typeof item === "string" ? item : item.id;
    return this.items[itemId].amount ?? 0;
  }

  has(item: Item): boolean;
  has(itemId: string): boolean;
  has(item: Item | string): boolean {
    const itemId = typeof item === "string" ? item : item.id;
    return (this.items[itemId].amount ?? 0) > 0;
  }

  completed(item: Item): boolean;
  completed(itemId: string): boolean;
  completed(item: Item | string): boolean {
    const itemId = typeof item === "string" ? item : item.id;
    if (!getItems()[itemId]?.museum) return false;
    return this.count(itemId) >= getItems()[itemId].museum.threshold;
  }
  
  completedAt(item: Item): boolean;
  completedAt(itemId: string): boolean;
  completedAt(item: Item | string): boolean {
    const itemId = typeof item === "string" ? item : item.id;
    if (!getItems()[itemId]?.museum) return false;
    return this.count(itemId) >= getItems()[itemId].museum.threshold;
  }
  
  // check if this is the actual format it needs to be saved as i cba rn
  toJSON(): { [itemId: string]: {amount: number; completed: boolean; completedAt: Date} } {
    return this.items;
  }
}

export async function getMuseum(member: MemberResolvable): Promise<Museum> {
  const userId = getUserId(member);

  const cache = await redis.get(`${Constants.redis.cache.economy.MUSEUM}:${userId}`);

  if (cache) {
    try {
      const parsed = JSON.parse(cache);
      return new Museum(userId, parsed);
    } catch (e) {
      console.error(e);
      logger.error("weird museum cache error", { error: e });
      return new Museum(userId);
    }
  }

  const query = await prisma.museum
    .findMany({
      where: {
        userId,
      },
      select: {
        item: true,
        amount: true,
        completed: true,
        completedAt: true
      },
    })
    .then((q) =>
      q.map((i) => {
        return { item: i.item, amount: Number(i.amount), completed: i.completed, completedAt: i.completedAt };
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
    return new Museum(userId);
  }

  const museum = new Museum(userId, query);

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
      userId_item: {
        userId,
        item: itemId,
      },
    },
    update: {
      amount: { increment: amount },
    },
    create: {
      userId,
      item: itemId,
      amount: amount,
    },
  });

  await redis.del(
    `${Constants.redis.cache.economy.MUSEUM}:${userId}`,
  );
}