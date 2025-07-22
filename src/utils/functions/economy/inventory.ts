import dayjs = require("dayjs");
import { ClusterManager } from "discord-hybrid-sharding";
import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import { CommandCategory } from "../../../models/Command";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { Item } from "../../../types/Economy";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getUserId, MemberResolvable } from "../member";
import { getTier, isPremium } from "../premium/premium";
import { percentChance } from "../random";
import sleep from "../sleep";
import { pluralize } from "../string";
import { getTax } from "../tax";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { addProgress } from "./achievements";
import { addBalance, getSellMulti } from "./balance";
import {
  deleteMarketOrder,
  getMarketAverage,
  getMarketOrders,
  setMarketOrderAmount,
} from "./market";
import { getOffersAverage } from "./offers";
import { addStat } from "./stats";
import { deleteTradeRequest, getTradeRequests } from "./trade_requests";
import { createUser, getItems, userExists } from "./utils";
import ms = require("ms");

const gemChanceCooldown = new Set<string>();
setInterval(() => {
  gemChanceCooldown.clear();
}, 60000);

export async function getInventory(member: MemberResolvable): Promise<Inventory> {
  const userId = getUserId(member);

  const cache = await redis.get(`${Constants.redis.cache.economy.INVENTORY}:${userId}`);

  if (cache) {
    try {
      const parsed = JSON.parse(cache);
      return new Inventory(userId, parsed);
    } catch (e) {
      console.error(e);
      logger.error("weird inventory cache error", { error: e });
      return new Inventory(userId);
    }
  }

  const query = await prisma.inventory
    .findMany({
      where: {
        userId,
      },
      select: {
        item: true,
        amount: true,
      },
    })
    .then((q) =>
      q.map((i) => {
        return { item: i.item, amount: Number(i.amount) };
      }),
    )
    .catch(() => {});

  if (!query || query.length == 0) {
    if (!(await userExists(userId))) await createUser(userId);
    await redis.set(
      `${Constants.redis.cache.economy.INVENTORY}:${userId}`,
      JSON.stringify({}),
      "EX",
      180,
    );
    return new Inventory(userId);
  }

  const inventory = new Inventory(userId, query);

  await redis.set(
    `${Constants.redis.cache.economy.INVENTORY}:${userId}`,
    JSON.stringify(inventory.toJSON()),
    "EX",
    180,
  );

  return inventory;
}

export class Inventory {
  private items: { [itemId: string]: number };
  private userId: string;

  constructor(
    member: MemberResolvable,
    data?: { [itemId: string]: number } | { item: string; amount: number }[],
  ) {
    this.userId = getUserId(member);
    this.items = {};

    if (Array.isArray(data)) {
      for (const i of data) {
        this.items[i.item] = i.amount;
      }
    } else if (data) {
      this.items = data;
    }
  }

  get entries(): { item: string; amount: number }[] {
    return Object.entries(this.items).map(([item, amount]) => ({
      item,
      amount,
    }));
  }

  count(item: Item): number;
  count(itemId: string): number;
  count(item: Item | string): number {
    const itemId = typeof item === "string" ? item : item.id;
    return this.items[itemId] ?? 0;
  }

  has(item: Item): boolean;
  has(itemId: string): boolean;
  has(item: Item | string): boolean {
    const itemId = typeof item === "string" ? item : item.id;
    return (this.items[itemId] ?? 0) > 0;
  }

  async hasGem(
    id: "crystal_heart" | "white_gem" | "pink_gem" | "purple_gem" | "blue_gem" | "green_gem",
  ): Promise<{ any: boolean; inInventory: boolean; inOrders: boolean; inTrades: boolean }> {
    const cache = await redis.get(`${Constants.redis.cache.economy.HAS_GEM}:${this.userId}:${id}`);
    if (cache) {
      return JSON.parse(cache);
    }

    const inInv = this.has(id);

    const inOrders =
      (await getMarketOrders(this.userId, "sell")).filter((i) => i.itemId == id).length > 0;

    const inTrades =
      (await getTradeRequests(this.userId)).filter((i) =>
        i.offeredItems.find((m) => m.startsWith(id)),
      ).length > 0;

    const res = {
      any: inInv || inOrders || inTrades,
      inInventory: inInv,
      inOrders: inOrders,
      inTrades: inTrades,
    };

    await redis.set(
      `${Constants.redis.cache.economy.HAS_GEM}:${this.userId}:${id}`,
      JSON.stringify(res),
      "EX",
      180,
    );

    return res;
  }

  toJSON(): { [itemId: string]: number } {
    return this.items;
  }
}

async function doAutosellThing(
  userId: string,
  itemId: string,
  amount: number,
  client?: NypsiClient,
): Promise<void> {
  if (await redis.exists(`${Constants.redis.nypsi.AUTO_SELL_PROCESS}:${userId}`)) {
    await sleep(100);
    return doAutosellThing(userId, itemId, amount, client);
  }

  await redis.set(`${Constants.redis.nypsi.AUTO_SELL_PROCESS}:${userId}`, "t", "EX", 69);

  const item = getItems()[itemId];

  let sellWorth = Math.floor(item.sell * amount);

  const multi = (await getSellMulti(userId, client)).multi;

  if (item.role == "fish" || item.role == "prey" || item.role == "sellable") {
    sellWorth = Math.floor(sellWorth + sellWorth * multi);
  } else if (!item.sell) {
    sellWorth = 1000 * amount;
  }

  if (["bitcoin", "ethereum"].includes(item.id))
    sellWorth = Math.floor(sellWorth - sellWorth * 0.05);

  let tax = true;

  if ((await isPremium(userId)) && (await getTier(userId)) == 4) tax = false;

  if (tax) {
    const taxedAmount = Math.floor(sellWorth * (await getTax()));

    sellWorth = sellWorth - taxedAmount;
  }

  await addBalance(userId, sellWorth);

  addStat(userId, "earned-sold", sellWorth);

  await redis.hincrby(
    `${Constants.redis.nypsi.AUTO_SELL_ITEMS}:${userId}`,
    `${itemId}-money`,
    sellWorth,
  );
  await redis.hincrby(
    `${Constants.redis.nypsi.AUTO_SELL_ITEMS}:${userId}`,
    `${itemId}-amount`,
    amount,
  );

  if (!(await redis.lrange(Constants.redis.nypsi.AUTO_SELL_ITEMS_MEMBERS, 0, -1)).includes(userId))
    await redis.lpush(Constants.redis.nypsi.AUTO_SELL_ITEMS_MEMBERS, userId);

  await redis.del(`${Constants.redis.nypsi.AUTO_SELL_PROCESS}:${userId}`);
  return;
}

export async function addInventoryItem(member: MemberResolvable, itemId: string, amount: number) {
  const userId = getUserId(member);

  if (itemId.includes("gem")) {
    logger.debug(`gems: ${userId} added ${amount}x ${itemId}`);
  }

  if (amount <= 0) return;

  if (!(await userExists(userId))) await createUser(userId);

  if (!getItems()[itemId]) {
    console.trace();
    return logger.error(`invalid item: ${itemId}`);
  }

  if ((await getAutosellItems(userId)).includes(itemId)) {
    return doAutosellThing(
      userId,
      itemId,
      amount,
      member instanceof GuildMember ? (member.client as NypsiClient) : undefined,
    );
  }

  await prisma.inventory.upsert({
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
    `${Constants.redis.cache.economy.INVENTORY}:${userId}`,
    `${Constants.redis.cache.economy.ITEM_EXISTS}:${itemId}`,
    ...(isGem(itemId) ? [`${Constants.redis.cache.economy.HAS_GEM}:${userId}:${itemId}`] : []),
  );
}

export async function removeInventoryItem(
  member: MemberResolvable,
  itemId: string,
  amount: number,
) {
  const userId = getUserId(member);

  if (amount <= 0) return;

  if (!(await userExists(userId))) await createUser(userId);

  if (!getItems()[itemId]) {
    console.trace();
    return logger.error(`invalid item: ${itemId}`);
  }

  const query = await prisma.inventory.upsert({
    where: {
      userId_item: {
        userId,
        item: itemId,
      },
    },
    update: {
      amount: { decrement: amount },
    },
    create: {
      userId,
      item: itemId,
      amount: amount,
    },
    select: {
      amount: true,
    },
  });

  if (query.amount <= 0) {
    await prisma.inventory
      .delete({
        where: {
          userId_item: {
            userId,
            item: itemId,
          },
        },
      })
      .catch(() => {});
  }

  await redis.del(
    `${Constants.redis.cache.economy.INVENTORY}:${userId}`,
    `${Constants.redis.cache.economy.ITEM_EXISTS}:${itemId}`,
    ...(isGem(itemId) ? [`${Constants.redis.cache.economy.HAS_GEM}:${userId}:${itemId}`] : []),
  );
}

export async function setInventoryItem(member: MemberResolvable, itemId: string, amount: number) {
  const userId = getUserId(member);

  if (itemId.includes("gem")) {
    logger.debug(`gems: ${userId} set ${amount}x ${itemId}`);
  }

  if (!getItems()[itemId]) {
    console.trace();
    return logger.error(`invalid item: ${itemId}`);
  }

  if (amount <= 0) {
    await prisma.inventory
      .delete({
        where: {
          userId_item: {
            userId,
            item: itemId,
          },
        },
      })
      .catch(() => {});
  } else {
    await prisma.inventory.upsert({
      where: {
        userId_item: {
          userId,
          item: itemId,
        },
      },
      update: {
        amount: amount,
      },
      create: {
        userId,
        item: itemId,
        amount: amount,
      },
    });
  }

  await redis.del(
    `${Constants.redis.cache.economy.INVENTORY}:${userId}`,
    `${Constants.redis.cache.economy.ITEM_EXISTS}:${itemId}`,
    ...(isGem(itemId) ? [`${Constants.redis.cache.economy.HAS_GEM}:${userId}:${itemId}`] : []),
  );
}

export async function getTotalAmountOfItem(itemId: string) {
  if (itemId === "lottery_ticket") return 0;

  const query = await prisma.inventory.aggregate({
    where: {
      item: itemId,
    },
    _sum: {
      amount: true,
    },
  });

  const market = await prisma.market.aggregate({
    where: {
      AND: [{ completed: false }, { itemId: itemId }, { orderType: "sell" }],
    },
    _sum: {
      itemAmount: true,
    },
  });

  return Number(query?._sum?.amount || 0) + market?._sum?.itemAmount || 0;
}

export function selectItem(search: string) {
  search = search.toLowerCase();
  const items = getItems();

  for (const item of Array.from(Object.values(items))) {
    const aliases = item.aliases || [];
    if (search === item.id) {
      return item;
    } else if (search === item.name) {
      return item;
    } else if (search === item.id.split("_").join("")) {
      return item;
    } else if (aliases.indexOf(search) != -1) {
      return item;
    } else if (search === item.name.split(" ").join("")) {
      return item;
    } else if (search === item.plural) {
      return item;
    }
  }

  return undefined;
}

export async function commandGemCheck(member: MemberResolvable, commandCategory: CommandCategory) {
  const userId = getUserId(member);

  if (await redis.exists(Constants.redis.nypsi.GEM_GIVEN)) return;
  if (!(await userExists(member))) return;
  if (!(await getDmSettings(member)).other) return;
  if (gemChanceCooldown.has(userId)) return;
  gemChanceCooldown.add(userId);

  if (percentChance(0.001)) {
    await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t", "EX", 86400);
    const gems = ["green_gem", "blue_gem", "purple_gem", "pink_gem"];

    const gem = gems[Math.floor(Math.random() * gems.length)];

    logger.info(`${userId} received ${gem} randomly`);

    await addInventoryItem(member, gem, 1);
    addProgress(member, "gem_hunter", 1);

    if ((await getDmSettings(member)).other) {
      addNotificationToQueue({
        memberId: userId,
        payload: {
          embed: new CustomEmbed(
            member,
            `${getItems()[gem].emoji} you've found a gem! i wonder what powers it holds...`,
          ).setTitle("you've found a gem"),
        },
      });
    }
  }

  if (commandCategory == "moderation") {
    if (percentChance(0.07)) {
      await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t", "EX", 86400);
      logger.info(`${userId} received pink_gem randomly`);
      await addInventoryItem(member, "pink_gem", 1);
      addProgress(userId, "gem_hunter", 1);

      if ((await getDmSettings(member)).other) {
        addNotificationToQueue({
          memberId: userId,
          payload: {
            embed: new CustomEmbed(
              member,
              `${
                getItems()["pink_gem"].emoji
              } you've found a gem! i wonder what powers it holds...`,
            ).setTitle("you've found a gem"),
          },
        });
      }
    }
  } else if (commandCategory == "animals") {
    if (percentChance(0.007)) {
      await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t", "EX", 86400);
      logger.info(`${userId} received purple_gem randomly`);
      await addInventoryItem(member, "purple_gem", 1);
      addProgress(member, "gem_hunter", 1);

      if ((await getDmSettings(member)).other) {
        addNotificationToQueue({
          memberId: userId,
          payload: {
            embed: new CustomEmbed(
              member,
              `${
                getItems()["purple_gem"].emoji
              } you've found a gem! i wonder what powers it holds...`,
            ).setTitle("you've found a gem"),
          },
        });
      }
    }
  }
}

export function isGem(itemId: string) {
  return itemId.includes("_gem") || itemId === "crystal_heart";
}

export async function gemBreak(
  member: MemberResolvable,
  chance: number,
  gem: "blue_gem" | "purple_gem" | "pink_gem" | "green_gem" | "white_gem",
  client?: NypsiClient | ClusterManager,
  shatterOnly = false,
  sendMessage = true,
) {
  if (!percentChance(chance)) return;

  const userId = getUserId(member);

  const inventory = await getInventory(userId);
  const gemLocation = await inventory.hasGem(gem);

  if (!shatterOnly && ((await inventory.hasGem("crystal_heart")).any || !gemLocation.any)) return;

  let uniqueGemCount = 0;

  if ((await inventory.hasGem("pink_gem")).any) uniqueGemCount++;
  if ((await inventory.hasGem("purple_gem")).any) uniqueGemCount++;
  if ((await inventory.hasGem("blue_gem")).any) uniqueGemCount++;
  if ((await inventory.hasGem("green_gem")).any) uniqueGemCount++;
  if ((await inventory.hasGem("white_gem")).any) uniqueGemCount++;

  if (
    !shatterOnly &&
    uniqueGemCount === 5 &&
    percentChance(25) &&
    (await getDmSettings(userId)).other
  ) {
    await Promise.all([
      removeInventoryItem(userId, "pink_gem", 1),
      removeInventoryItem(userId, "purple_gem", 1),
      removeInventoryItem(userId, "blue_gem", 1),
      removeInventoryItem(userId, "green_gem", 1),
      removeInventoryItem(userId, "white_gem", 1),
      prisma.crafting.create({
        data: {
          amount: 1,
          finished: dayjs().add(7, "days").toDate(),
          itemId: "crystal_heart",
          userId,
        },
      }),
    ]);

    addNotificationToQueue({
      memberId: userId,
      payload: {
        embed: new CustomEmbed(userId)
          .setTitle("a very exciting moment")
          .setFooter({ text: "use /craft to view the progress" })
          .setDescription(
            `${
              getItems()["crystal_heart"].emoji
            } a truly historic event is taking place\nyour gems are fusing together, into one crystal\n\n` +
              `${getItems()["white_gem"].emoji} ${getItems()["pink_gem"].emoji} ${
                getItems()["purple_gem"].emoji
              } ${getItems()["blue_gem"].emoji} ${getItems()["green_gem"].emoji}`,
          ),
      },
    });
    return;
  }

  let footer = "";

  if (gemLocation.inInventory) {
    await removeInventoryItem(userId, gem, 1);
  } else if (gemLocation.inOrders) {
    const orders = (await getMarketOrders(userId, "sell")).filter((i) => i.itemId == gem);
    if (orders.length == 0) return;

    const order = orders[orders.length - 1];

    if (order.itemAmount > 1) {
      await setMarketOrderAmount(order.id, order.itemAmount - 1);
    } else {
      const res = await deleteMarketOrder(order.id, client);
      if (typeof res == "string" || !res) return;

      await addInventoryItem(order.ownerId, order.itemId, order.itemAmount);

      if ((await (await getInventory(userId)).hasGem(gem)).inInventory) {
        await removeInventoryItem(userId, gem, 1);
      } else return;
    }

    footer = `this gem was in a sell order. ${order.itemAmount > 1 ? "one gem has been removed from this order" : "this order has been cancelled"}`;
  } else if (gemLocation.inTrades) {
    const trades = (await getTradeRequests(userId)).filter((i) =>
      i.offeredItems.find((m) => m.startsWith(gem)),
    );
    if (trades.length == 0) return;

    const trade = trades[trades.length - 1];

    const res = await deleteTradeRequest(trade.id, client).catch(() => {});
    if (!res) return;

    for (const item of trade.offeredItems) {
      const itemId = item.split(":")[0];
      const amount = parseInt(item.split(":")[1]);

      await addInventoryItem(trade.ownerId, itemId, amount);
    }

    if (trade.offeredMoney > 0) {
      await addBalance(trade.ownerId, Number(trade.offeredMoney));
    }

    if ((await (await getInventory(userId)).hasGem(gem)).inInventory) {
      await removeInventoryItem(userId, gem, 1);
    } else return;

    footer = "this gem was in a trade request. your trade request has been cancelled";
  }

  const shardMax = new Map<string, number>([
    ["blue_gem", 3],
    ["green_gem", 5],
    ["purple_gem", 10],
    ["pink_gem", 15],
    ["white_gem", 30],
  ]);

  const amount = Math.floor(Math.random() * shardMax.get(gem) - 1) + 1;

  await addInventoryItem(userId, "gem_shard", amount);

  const embed = new CustomEmbed(userId)
    .setTitle(`your ${getItems()[gem].name} has shattered`)
    .setDescription(
      `${
        getItems()[gem].emoji
      } your gem exerted too much power and destroyed itself. shattering into ${amount} ${pluralize("piece", amount)}`,
    );

  if (footer) embed.setFooter({ text: footer });

  if (sendMessage && (await getDmSettings(userId)).other) {
    addNotificationToQueue({
      memberId: userId,
      payload: {
        embed: embed,
      },
    });
  }

  return {
    shards: amount,
    footerMsg: footer,
  };
}

export async function setAutosellItems(member: MemberResolvable, items: string[]) {
  const userId = getUserId(member);

  const query = await prisma.economy
    .update({
      where: {
        userId,
      },
      data: {
        autosell: items,
      },
      select: {
        autosell: true,
      },
    })
    .then((q) => q.autosell);

  await redis.del(`${Constants.redis.cache.economy.AUTO_SELL}:${userId}`);

  return query;
}

export async function getAutosellItems(member: MemberResolvable) {
  const userId = getUserId(member);

  if (await redis.exists(`${Constants.redis.cache.economy.AUTO_SELL}:${userId}`)) {
    return JSON.parse(
      await redis.get(`${Constants.redis.cache.economy.AUTO_SELL}:${userId}`),
    ) as string[];
  }

  const query = await prisma.economy
    .findUnique({
      where: {
        userId,
      },
      select: {
        autosell: true,
      },
    })
    .then((q) => q.autosell);

  await redis.set(
    `${Constants.redis.cache.economy.AUTO_SELL}:${userId}`,
    JSON.stringify(query),
    "EX",
    Math.floor(ms("1 hour") / 1000),
  );

  return query;
}

export async function setSellFilter(member: MemberResolvable, items: string[]) {
  const userId = getUserId(member);

  const query = await prisma.economy
    .update({
      where: {
        userId,
      },
      data: {
        sellallFilter: items,
      },
      select: {
        sellallFilter: true,
      },
    })
    .then((q) => q.sellallFilter);

  await redis.del(`${Constants.redis.cache.economy.SELL_FILTER}:${userId}`);

  return query;
}

export async function getSellFilter(member: MemberResolvable) {
  const userId = getUserId(member);

  if (await redis.exists(`${Constants.redis.cache.economy.SELL_FILTER}:${userId}`)) {
    return JSON.parse(
      await redis.get(`${Constants.redis.cache.economy.SELL_FILTER}:${userId}`),
    ) as string[];
  }

  const query = await prisma.economy
    .findUnique({
      where: {
        userId,
      },
      select: {
        sellallFilter: true,
      },
    })
    .then((q) => q.sellallFilter);

  await redis.set(
    `${Constants.redis.cache.economy.SELL_FILTER}:${userId}`,
    JSON.stringify(query),
    "EX",
    Math.floor(ms("1 hour") / 1000),
  );

  return query;
}

export async function calcItemValue(item: string) {
  let itemValue = 1000;

  if (
    getItems()[item].buy ||
    item === "cookie" ||
    item === "bitcoin" ||
    item === "ethereum" ||
    ["prey", "fish", "sellable", "ore"].includes(getItems()[item].role)
  ) {
    itemValue = getItems()[item].sell || 1000;
  } else {
    const [marketAvg, offersAvg] = await Promise.all([
      getMarketAverage(item),
      getOffersAverage(item),
    ]);

    if (!offersAvg && marketAvg) return marketAvg;
    if (!marketAvg && offersAvg) return offersAvg;
    if (!marketAvg && !offersAvg) return undefined;

    itemValue = Math.floor(
      [offersAvg, marketAvg, marketAvg, marketAvg].reduce((a, b) => a + b) / 4,
    );
  }

  (async () => {
    if (await redis.exists(`nypsi:item:value:store:cache:delay:thing:${item}`)) return;
    await redis.set(
      `nypsi:item:value:store:cache:delay:thing:${item}`,
      "69",
      "EX",
      3600 * Math.floor(Math.random() * 6) + 7,
    );

    const date = dayjs()
      .set("hours", 0)
      .set("minutes", 0)
      .set("seconds", 0)
      .set("milliseconds", 0)
      .toDate();

    const itemCheck = await prisma.graphMetrics.findFirst({
      where: {
        AND: [{ date }, { category: `item-value-${item}` }, { userId: "global" }],
      },
    });

    if (itemCheck) return;

    await prisma.graphMetrics.create({
      data: {
        date,
        category: `item-value-${item}`,
        userId: "global",
        value: itemValue,
      },
    });
  })();

  return itemValue;
}

export async function itemExists(itemId: string) {
  const cache = await redis.get(`${Constants.redis.cache.economy.ITEM_EXISTS}:${itemId}`);

  if (cache === "t") return true;
  else if (cache === "f") return false;

  const inventory = await prisma.inventory.findFirst({
    where: {
      item: itemId,
    },
  });

  if (inventory) {
    await redis.set(`${Constants.redis.cache.economy.ITEM_EXISTS}:${itemId}`, "t");
    return true;
  }

  const market = await prisma.market.findFirst({
    where: {
      completed: false,
      itemId: itemId,
      orderType: "sell",
    },
  });

  if (market) {
    await redis.set(`${Constants.redis.cache.economy.ITEM_EXISTS}:${itemId}`, "t");
    return true;
  }

  await redis.set(`${Constants.redis.cache.economy.ITEM_EXISTS}:${itemId}`, "f");
  return false;
}
