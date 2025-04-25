import { MarketWatch, OrderType } from "@prisma/client";
import {
  GuildMember,
} from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed, getColor } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { logger, transaction } from "../../logger";
import { getAllGroupAccountIds } from "../moderation/alts";
import { filterOutliers } from "../outliers";
import { getTier } from "../premium/premium";
import { addToNypsiBank, getTax } from "../tax";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { addBalance, getBalance, removeBalance } from "./balance";
import { addInventoryItem, getInventory, setInventoryItem } from "./inventory";
import { addStat } from "./stats";
import { createUser, getItems, userExists } from "./utils";
import ms = require("ms");
import { Item } from "../../../types/Economy";

const inTransaction = new Set<string>();
const dmQueue = new Map<string, { buyers: Map<string, number> }>();

export async function getMarketOrders(member: GuildMember | string | undefined, type: OrderType) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.marketOrder.findMany({
    where: {
      AND: [(member ? { ownerId: id } : {}), { completed: false }, { orderType: type }],
    },
    orderBy: { createdAt: "asc" },
  });

  return query;
}


export async function getMarketItemOrders(itemId: string, type: OrderType, filterOutUserId?: string) {
  const query = await prisma.marketOrder.findMany({
    where: {
      AND: [{ itemId: itemId }, { completed: false }, { orderType: type }],
    },
    orderBy: [{ price: "desc" }, { createdAt: "asc" }],
  });

  if (filterOutUserId) return query.filter((m) => m.ownerId !== filterOutUserId);
  return query;
}

export async function getMarketAverage(item: string) {
  if (await redis.exists(`${Constants.redis.cache.economy.MARKET_AVG}:${item}`))
    return parseInt(await redis.get(`${Constants.redis.cache.economy.MARKET_AVG}:${item}`));

  const orders = await prisma.marketOrder.findMany({
    where: {
      AND: [{ completed: true }, { itemId: item } ],
    },
    select: {
      price: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });

  const costs: number[] = [];

  for (const order of orders) {
    if (costs.length >= 500) break;

    costs.push(Number(order.price));
  }

  let filtered = filterOutliers(costs);

  if (!filtered) {
    logger.warn("failed to filter outliers (market)", { costs, item, orders });
    filtered = costs;
  }

  const sum = filtered.reduce((a, b) => a + b, 0);
  const avg = Math.floor(sum / filtered.length) || 0;

  await redis.set(
    `${Constants.redis.cache.economy.MARKET_AVG}:${item}`,
    avg,
    "EX",
    ms("3 hour") / 1000,
  );

  return avg;
}

export async function updateMarketWatch(member: GuildMember, itemName: string, type: OrderType, priceThreshold?: number) {
  await prisma.marketWatch.upsert({
    where: {
      userId_itemId_orderType: {
        userId: member.user.id,
        itemId: itemName,
        orderType: type,
      },
    },
    update: {
      itemId: itemName,
      priceThreshold: priceThreshold,
    },
    create: {
      userId: member.user.id,
      itemId: itemName,
      priceThreshold: priceThreshold,
      orderType: type,
    },
  });

  return getMarketWatch(member);
}

export async function setMarketWatch(member: GuildMember, items: MarketWatch[]) {
  await prisma.marketWatch.deleteMany({ where: { userId: member.user.id } });

  await prisma.marketWatch.createMany({ data: items });
  return items;
}

export async function deleteMarketWatch(member: GuildMember, type: OrderType, itemId: string) {
  await prisma.marketWatch.delete({
    where: {
      userId_itemId_orderType: {
        userId: member.user.id,
        itemId: itemId,
        orderType: type
      },
    },
  });

  return getMarketWatch(member);
}

export async function getMarketWatch(member: GuildMember) {
  return await prisma.economy
    .findUnique({
      where: {
        userId: member.user.id,
      },
      select: {
        MarketWatch: true,
      },
    })
    .then((q) => q.MarketWatch);
}

export async function checkMarketWatchers(
  itemId: string,
  amount: number,
  creatorId: string,
  type: OrderType,
  cost: number,
) {
  const users = await prisma.marketWatch
    .findMany({
      where: {
        AND: [
          { itemId: itemId },
          { userId: { not: creatorId } },
          { orderType: type },
          { OR: [{ priceThreshold: (type == "buy" ? { lte: Math.floor(cost) } : { gte: Math.floor(cost) }) }, { priceThreshold: 0 }] },
        ],
      },
      select: {
        userId: true,
      },
    })
    .then((q) => q.map((i) => i.userId));

  const payload = {
    payload: {
      embed: new CustomEmbed().setDescription(
        `a ${type} order has made been for ${amount} ${getItems()[itemId].emoji} **[${
          amount == 1 || !getItems()[itemId].plural ? getItems()[itemId].name : getItems()[itemId].plural
        }](https://nypsi.xyz/item/${itemId})**`,
      ),
    },
    memberId: "boob",
  };

  for (const userId of users) {
    if (!(await getDmSettings(userId)).market) continue;

    if (await redis.exists(`${Constants.redis.cooldown.MARKET_WATCH}:${userId}`)) continue;

    payload.memberId = userId;
    payload.payload.embed.setColor(getColor(userId));

    addNotificationToQueue(payload);

    await redis.set(`${Constants.redis.cooldown.MARKET_WATCH}:${userId}`, "true", "EX", 300);
  }
}

export async function countItemOnMarket(itemId: string, type: OrderType) {
  const amount = await prisma.marketOrder.aggregate({
    where: {
      AND: [{ completed: false }, { itemId: itemId }, { orderType: type }],
    },
    _sum: {
      itemAmount: true,
    },
  });

  return amount?._sum?.itemAmount || 0;
}

export async function deleteMarketOrder(id: number, client: NypsiClient, repeatCount = 1) {
  
  const order = await prisma.marketOrder
    .findFirst({
      where: {
        AND: [{ id: id }, { completed: false }],
      },
    })
    .catch(() => {});

  if (!order) return false;

  if (
    inTransaction.has(order.itemId) ||
    (await redis.exists(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${id}`))
  ) {
    return new Promise((resolve) => {
      logger.debug(`repeating market order delete - ${id}`);
      setTimeout(async () => {
        if (repeatCount > 100) {
          inTransaction.delete(order.itemId);
          await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${id}`);
        }
        resolve(deleteMarketOrder(id, client, repeatCount + 1));
      }, 1000);
    });
  }

  await prisma.marketOrder.delete({
    where: {
      id: id,
    }
  });

  return Boolean(order);
}

export async function getPriceForMarketTransaction(itemId: string, amount: number, type: OrderType, filterOutUserId: string) {
  const orders = await getMarketItemOrders(itemId, (type == "buy" ? "sell" : "buy"), filterOutUserId);

  let cost = 0;

  for (const order of orders) {
    if (amount >= order.itemAmount) {
      cost += Number(order.price * order.itemAmount);
      amount -= Number(order.itemAmount);
    } else {
      cost += Number(order.price) * amount;
      amount = 0;
      break;
    }
  }
  
  return amount == 0 ? cost : -1;
}

export async function checkMarketOverlap(member: GuildMember, itemId: string, createdOrderType: OrderType, repeatCount?: number) {
  if (inTransaction.has(itemId)) {
    return new Promise((resolve) => {
      logger.debug(
        `repeating market overlap check - ${itemId}`,
      );
      setTimeout(async () => {
        if (repeatCount > 100) inTransaction.delete(itemId);
        resolve(
          checkMarketOverlap(
            member,
            itemId,
            createdOrderType,
            repeatCount + 1,
          ),
        );
      }, 50);
    });
  }

  const buyOrders = await getMarketItemOrders(itemId, "buy");
  const sellOrders = await getMarketItemOrders(itemId, "sell");

  if (buyOrders.length == 0 || sellOrders.length == 0) return;
  
  const highestBuyOrder = buyOrders.reduce((prev, current) => 
    current.price > prev.price ? current : prev
  );

  const lowestSellOrder = sellOrders.reduce((prev, current) => 
    current.price < prev.price ? current : prev
  );

  if (highestBuyOrder.price < lowestSellOrder.price) return;
  
  const sellOrdersBelowPrice = sellOrders.filter((i) => i.price <= highestBuyOrder.price);
  const buyOrdersAbovePrice = buyOrders.filter((i) => i.price >= lowestSellOrder.price);
  const countBetweenPrices = Math.min(sellOrdersBelowPrice.reduce((sum, item) => sum + Number(item.itemAmount), 0), Number(highestBuyOrder.itemAmount));

  inTransaction.add(itemId);
  await redis.set(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`, "d", "EX", 600);

  setTimeout(() => {
    inTransaction.delete(itemId);
  }, ms("10 minutes"));

  let amount = countBetweenPrices;

  if (createdOrderType == "buy") {

    await completeBuy(member, itemId, countBetweenPrices, sellOrdersBelowPrice);

    for (const order of sellOrdersBelowPrice) {
      await completeSell(await member.guild.members.fetch(order.ownerId), itemId, Math.min(amount, Number(order.itemAmount)), [await prisma.marketOrder.findUnique({where: { id: highestBuyOrder.id }})]);
      amount -= Math.min(amount, Number(order.itemAmount));
    }

    await addToNypsiBank(Number(highestBuyOrder.price - lowestSellOrder.price) * countBetweenPrices);
  } else {
    await completeSell(member, itemId, countBetweenPrices, buyOrdersAbovePrice);

    for (const order of buyOrdersAbovePrice) {
      await completeBuy(await member.guild.members.fetch(order.ownerId), itemId, Math.min(amount, Number(order.itemAmount)), [await prisma.marketOrder.findUnique({where: { id: lowestSellOrder.id }})]);
      amount -= Math.min(amount, Number(order.itemAmount));
    }
    
    await addToNypsiBank(Number(highestBuyOrder.price - lowestSellOrder.price) * countBetweenPrices);
  }

  logger.info(
    `market ${itemId} fixed overlap`
  );
  
  await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
  inTransaction.delete(itemId);
}

export async function marketBuy(
  item: Item,
  amount: number,
  storedPrice: number,
  member: GuildMember,
  repeatCount = 1,
) {
  if (inTransaction.has(item.id)) {
    return new Promise((resolve) => {
      logger.debug(
        `repeating market buy - ${amount}x ${item.id}`,
      );
      setTimeout(async () => {
        if (repeatCount > 100) inTransaction.delete(item.id);
        resolve(
          marketBuy(
            item,
            amount,
            storedPrice,
            member,
            repeatCount + 1,
          ),
        );
      }, 50);
    });
  }

  inTransaction.add(item.id);
  await redis.set(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`, "d", "EX", 600);

  if (!(await userExists(member.id))) await createUser(member.id);

  const buyPrice = await getPriceForMarketTransaction(item.id, amount, "buy", member.id);

  if (buyPrice == -1) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`);
    inTransaction.delete(item.id);
    return "not enough items"
  }

  if (storedPrice !== buyPrice) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`);
    inTransaction.delete(item.id);
    return `since viewing the market, the price has changed from $${storedPrice.toLocaleString()} to $${buyPrice.toLocaleString()}. please press purchase again with this updated price in mind`;
  }

  if ((await getBalance(member)) < buyPrice) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`);
    inTransaction.delete(item.id);
    return "you cannot afford this";
  }

  setTimeout(() => {
    inTransaction.delete(item.id);
  }, ms("10 minutes"));

  const sellOrders = await getMarketItemOrders(item.id, "sell", member.id);

  const totalTax = await completeBuy(member, item.id, amount, sellOrders);

  if (totalTax == "not enough items") return "not enough items";
  
  if (totalTax > 0) addToNypsiBank(totalTax);

  await Promise.all([
    addInventoryItem(member, item.id, Number(amount)),
    removeBalance(member, buyPrice),
    addStat(member, "spent-market", buyPrice - totalTax),
  ]);

  logger.info(
    `market ${member.id} purchased ${amount} ${item.id}`
  );
  
  await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`);
  inTransaction.delete(item.id);

  return "success";
}

async function completeBuy(
  member: GuildMember,
  itemId: string,
  amount: number,
  sellOrders: {
    id: number;
    createdAt: Date;
    completed: boolean;
    itemId: string;
    orderType: OrderType;
    ownerId: string;
    itemAmount: bigint;
    price: bigint;
  }[]
) {
  const items = getItems();
  const tax = await getTax();

  let totalTax = 0;

  const usedOrders: {
    id: number,
    price: number,
    buyAmount: number,
    itemAmount: number,
    ownerId: string,
  }[] = [];

  let total = amount;
  
  for (const order of sellOrders) {
    if (total >= order.itemAmount) {
      usedOrders.push({
        id: order.id,
        price: Number(order.price),
        buyAmount: Number(order.itemAmount),
        itemAmount: Number(order.itemAmount),
        ownerId: order.ownerId,
      });
      total -= Number(order.itemAmount)
    } else {
      usedOrders.push({
        id: order.id,
        price: Number(order.price),
        buyAmount: total,
        itemAmount: Number(order.itemAmount),
        ownerId: order.ownerId,
      });
      total = 0;
      break;
    }
  }

  if (total > 0) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
    inTransaction.delete(itemId);
    return "not enough items"
  }

  for (const order of usedOrders) {
    const accounts = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, order.ownerId);  

    if (
      (order.price < 10_000 && order.itemAmount === 1) ||
      accounts.includes(member.id)
    ) {
      await prisma.marketOrder.delete({
        where: {
          id: order.id,
        },
      });
    } else if (order.itemAmount > order.buyAmount) {
      await prisma.marketOrder.create({
        data: {
          completed: true,
          itemId: itemId,
          itemAmount: order.buyAmount,
          price: order.price,
          orderType: "sell",
          ownerId: order.ownerId,
        },
      });

      await prisma.marketOrder
        .update({
          where: {
            id: order.id,
          },
          data: {
            itemAmount: { decrement: order.buyAmount },
          },
        })
        .catch(() => {});
    } else {
      await prisma.marketOrder
        .update({
          where: {
            id: order.id,
          },
          data: {
            completed: true,
          },
        })
        .catch(() => {});
    }
    
    let taxedAmount = 0;

    if ((await getTier(order.ownerId)) !== 4) {
      taxedAmount += Math.floor(order.buyAmount * order.price * tax);
    }

    totalTax += taxedAmount;

    await addBalance(order.ownerId, order.buyAmount * order.price - taxedAmount);
    await addStat(order.ownerId, "earned-market", order.buyAmount * order.price - taxedAmount)

    transaction(
      await member.client.users.fetch(order.ownerId),
      member.user,
      `${itemId} x ${order.buyAmount} (market buy)`,
    );
    transaction(
      member.user,
      await member.client.users.fetch(order.ownerId),
      `$${(order.buyAmount * order.price - taxedAmount).toLocaleString()} (market buy)`,
    );

    if ((await getDmSettings(order.ownerId)).market) {
      if (dmQueue.has(`${order.ownerId}-${itemId}`)) {
        if (
          dmQueue.get(`${order.ownerId}-${itemId}`).buyers.has(member.id)
        ) {
          dmQueue
            .get(`${order.ownerId}-${itemId}`)
            .buyers.set(
              member.user.username,
              dmQueue
                .get(`${order.ownerId}-${itemId}`)
                .buyers.get(member.user.username) + amount,
            );
        } else {
          dmQueue
            .get(`${order.ownerId}-${itemId}`)
            .buyers.set(member.user.username, amount);
        }
      } else {
        dmQueue.set(`${order.ownerId}-${itemId}`, {
          buyers: new Map([[member.user.username, amount]]),
        });

        setTimeout(async () => {
          if (!dmQueue.has(`${order.ownerId}-${itemId}`)) return;
          const buyers = dmQueue.get(`${order.ownerId}-${itemId}`).buyers;
          const total = Array.from(buyers.values()).reduce((a, b) => a + b);
          const moneyReceived = Math.floor(order.buyAmount * order.price);

          const embedDm = new CustomEmbed(order.ownerId)
            .setDescription(
              `${total.toLocaleString()}x of your ${items[itemId].emoji} ${
                items[itemId].name
              } sell order(s) has been bought by: \n${Array.from(buyers.entries())
                .map((i) => `**${i[0]}**: ${i[1]}`)
                .join("\n")}`,
            )
            .setFooter({ text: `+$${(moneyReceived - taxedAmount).toLocaleString()}` });
          dmQueue.delete(`${order.ownerId}-${itemId}`);

          addNotificationToQueue({
            memberId: order.ownerId,
            payload: {
              content: `${total.toLocaleString()}x of your sell order items have been bought`,
              embed: embedDm,
            },
          });
        }, ms("10 minutes"));
      }
    }
  }
  
  return totalTax;
}


export async function marketSell(
  item: Item,
  amount: number,
  storedPrice: number,
  member: GuildMember,
  repeatCount = 1,
) {
  if (inTransaction.has(item.id)) {
    return new Promise((resolve) => {
      logger.debug(
        `repeating market sell - ${amount}x ${item.id}`,
      );
      setTimeout(async () => {
        if (repeatCount > 100) inTransaction.delete(item.id);
        resolve(
          marketSell(
            item,
            amount,
            storedPrice,
            member,
            repeatCount + 1,
          ),
        );
      }, 50);
    });
  }

  inTransaction.add(item.id);
  await redis.set(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`, "d", "EX", 600);

  if (!(await userExists(member.id))) await createUser(member.id);

  const sellPrice = await getPriceForMarketTransaction(item.id, amount, "sell", member.id);

  if (sellPrice == -1) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`);
    inTransaction.delete(item.id);
    return "not enough items"
  }

  if (storedPrice !== sellPrice) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`);
    inTransaction.delete(item.id);
    return `since viewing the market, the sell price has changed from $${storedPrice.toLocaleString()} to $${sellPrice.toLocaleString()}. please press sell again with this updated price in mind`;
  }

  const inventory = await getInventory(member)
  
  if (
    !inventory.find((i) => i.item == item.id) ||
    inventory.find((i) => i.item == item.id).amount < amount
  ) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`);
    inTransaction.delete(item.id);
    return `you do not have this many ${item.plural ? item.plural : item.name}`;
  }

  setTimeout(() => {
    inTransaction.delete(item.id);
  }, ms("10 minutes"));

  const buyOrders = await getMarketItemOrders(item.id, "buy", member.id);

  const totalTax = await completeSell(member, item.id, amount, buyOrders);

  if (totalTax == "not enough items") return "not enough items";
  
  if (totalTax > 0) addToNypsiBank(totalTax);

  await Promise.all([
    setInventoryItem(member, item.id, (await getInventory(member)).find((i) => i.item == item.id).amount - Number(amount)),
    addBalance(member, sellPrice - totalTax),
    addStat(member, "earned-market", sellPrice - totalTax),
  ]);

  logger.info(
    `market ${member.id} sold ${amount} ${item.id}`
  );
  
  await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`);
  inTransaction.delete(item.id);

  return "success";
}

async function completeSell(
  member: GuildMember,
  itemId: string,
  amount: number,
  buyOrders: {
    id: number;
    createdAt: Date;
    completed: boolean;
    itemId: string;
    orderType: OrderType;
    ownerId: string;
    itemAmount: bigint;
    price: bigint;
  }[]
) {
  const usedOrders: {
    id: number,
    price: number,
    sellAmount: number,
    itemAmount: number,
    ownerId: string,
  }[] = [];
  
  let total = amount;

  for (const order of buyOrders) {
    if (total >= order.itemAmount) {
      usedOrders.push({
        id: order.id,
        price: Number(order.price),
        sellAmount: Number(order.itemAmount),
        itemAmount: Number(order.itemAmount),
        ownerId: order.ownerId,
      });
      total -= Number(order.itemAmount)
    } else {
      usedOrders.push({
        id: order.id,
        price: Number(order.price),
        sellAmount: total,
        itemAmount: Number(order.itemAmount),
        ownerId: order.ownerId,
      });
      total = 0;
      break;
    }
  }

  if (total > 0) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
    inTransaction.delete(itemId);
    return "not enough items"
  }

  const items = getItems();

  const tax = await getTax();

  let totalTax = 0;

  for (const order of usedOrders) {
    const accounts = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, order.ownerId);  

    if (
      (order.price < 10_000 && order.itemAmount === 1) ||
      accounts.includes(member.id)
    ) {
      await prisma.marketOrder.delete({
        where: {
          id: order.id,
        },
      });
    } else if (order.itemAmount > order.sellAmount) {
      await prisma.marketOrder.create({
        data: {
          completed: true,
          itemId: itemId,
          itemAmount: order.sellAmount,
          price: order.price,
          orderType: "buy",
          ownerId: order.ownerId,
        },
      });

      await prisma.marketOrder
        .update({
          where: {
            id: order.id,
          },
          data: {
            itemAmount: { decrement: order.sellAmount },
          },
        })
        .catch(() => {});
    } else {
      await prisma.marketOrder
        .update({
          where: {
            id: order.id,
          },
          data: {
            completed: true,
          },
        })
        .catch(() => {});
    }
    
    let taxedAmount = 0;

    if ((await getTier(member)) !== 4) {
      taxedAmount += Math.floor(order.sellAmount * order.price * tax);
    }

    totalTax += taxedAmount;

    addInventoryItem(order.ownerId, itemId, Number(amount)),
    await addStat(order.ownerId, "spent-market", order.sellAmount * order.price - taxedAmount)

    transaction(
      await member.client.users.fetch(order.ownerId),
      member.user,
      `$${(order.sellAmount * order.price - taxedAmount).toLocaleString()} (market sell)`,
    );
    transaction(
      member.user,
      await member.client.users.fetch(order.ownerId),
      `${itemId} x ${order.sellAmount} (market sell)`,
    );

    if ((await getDmSettings(order.ownerId)).market) {
      if (dmQueue.has(`${order.ownerId}-${itemId}`)) {
        if (
          dmQueue.get(`${order.ownerId}-${itemId}`).buyers.has(member.id)
        ) {
          dmQueue
            .get(`${order.ownerId}-${itemId}`)
            .buyers.set(
              member.user.username,
              dmQueue
                .get(`${order.ownerId}-${itemId}`)
                .buyers.get(member.user.username) + amount,
            );
        } else {
          dmQueue
            .get(`${order.ownerId}-${itemId}`)
            .buyers.set(member.user.username, amount);
        }
      } else {
        dmQueue.set(`${order.ownerId}-${itemId}`, {
          buyers: new Map([[member.user.username, amount]]),
        });

        setTimeout(async () => {
          if (!dmQueue.has(`${order.ownerId}-${itemId}`)) return;
          const buyers = dmQueue.get(`${order.ownerId}-${itemId}`).buyers;
          const total = Array.from(buyers.values()).reduce((a, b) => a + b);

          const embedDm = new CustomEmbed(order.ownerId)
            .setDescription(
              `${total.toLocaleString()}x of your ${items[itemId].emoji} ${
                items[itemId].name
              } buy order(s) has been fulfilled by: \n${Array.from(buyers.entries())
                .map((i) => `**${i[0]}**: ${i[1]}`)
                .join("\n")}`,
            )
          dmQueue.delete(`${order.ownerId}-${itemId}`);

          addNotificationToQueue({
            memberId: order.ownerId,
            payload: {
              content: `${total.toLocaleString()}x of your buy order items have been fulfilled`,
              embed: embedDm,
            },
          });
        }, ms("10 minutes"));
      }
    }
  }
  
  return totalTax;
}