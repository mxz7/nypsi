import { MarketWatch, OrderType } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMember,
  MessageActionRowComponentBuilder,
} from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed, getColor } from "../../../models/EmbedBuilders";
import { Item } from "../../../types/Economy";
import { NotificationPayload } from "../../../types/Notification";
import Constants from "../../Constants";
import { logger, transaction } from "../../logger";
import { getAllGroupAccountIds } from "../moderation/alts";
import { filterOutliers } from "../outliers";
import { getTier } from "../premium/premium";
import { addToNypsiBank, getTax } from "../tax";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { getLastKnownAvatar, getLastKnownUsername } from "../users/tag";
import { addBalance, getBalance, removeBalance } from "./balance";
import { addInventoryItem, getInventory, setInventoryItem } from "./inventory";
import { addStat } from "./stats";
import { createUser, getItems, userExists } from "./utils";
import ms = require("ms");

const inTransaction = new Set<string>();
/**
 * items is map of itemId -> map of userId -> amount
 */
const dmQueue = new Map<string, { earned: number; items: Map<string, Map<string, number>> }>();

export async function getMarketOrders(member: GuildMember | string | undefined, type: OrderType) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.marketOrder.findMany({
    where: {
      AND: [member ? { ownerId: id } : {}, { completed: false }, { orderType: type }],
    },
    orderBy: { createdAt: "asc" },
  });

  return query;
}

export async function getMarketOrder(id: number) {
  return await prisma.marketOrder.findFirst({
    where: { id: id },
  });
}

export async function getRecentMarketOrders(type: OrderType) {
  return await prisma.marketOrder.findMany({
    where: { AND: [{ completed: false }, { orderType: type }] },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
}

export async function getMarketItemOrders(
  itemId: string,
  type: OrderType,
  filterOutUserId?: string,
) {
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
      AND: [{ completed: true }, { itemId: item }],
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

export async function createMarketOrder(
  member: GuildMember | string,
  itemId: string,
  amount: number,
  price: number,
  orderType: OrderType,
  client: NypsiClient,
) {
  let ownerId: string;
  let username: string;
  let avatar: string;

  if (member instanceof GuildMember) {
    ownerId = member.user.id;
    username = member.user.username;
    avatar = member.user.displayAvatarURL();
  } else {
    ownerId = member;
  }

  const order = await prisma.marketOrder.create({
    data: {
      ownerId: ownerId,
      itemId: itemId,
      itemAmount: amount,
      price: price,
      orderType: orderType,
    },
    select: {
      createdAt: true,
      id: true,
    },
  });

  const checkSold = await checkMarketOverlap(member, itemId, orderType);
  let sold = false;

  if (checkSold) {
    const { completed, itemAmount } = await prisma.marketOrder.findFirst({
      where: {
        id: order.id,
      },
      select: {
        completed: true,
        itemAmount: true,
      },
    });

    if (completed) sold = true;
    else if (Number(itemAmount) !== amount) amount = Number(itemAmount);
  }

  if (!username) username = await getLastKnownUsername(ownerId);
  if (!avatar) avatar = await getLastKnownAvatar(ownerId);

  const embed = new CustomEmbed(member);
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

  embed.setHeader(username, avatar, `https://nypsi.xyz/user/${ownerId}`);

  let description: string;

  if (sold) {
    description = `fulfilled <t:${Math.floor(Date.now() / 1000)}:R>\n\n`;
  } else {
    description = `created <t:${Math.floor(order.createdAt.getTime() / 1000)}:R>\n\n`;
  }

  if (orderType === "buy") {
    embed.setColor("#79A2F6");
    description += `buying **${amount}x** ${getItems()[itemId].emoji} **[${getItems()[itemId].name}](https://nypsi.xyz/item/${itemId})** for $${(price * amount).toLocaleString()}`;
    row.addComponents(
      new ButtonBuilder().setCustomId("market-full").setLabel("sell").setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("market-partial")
        .setLabel("sell some")
        .setStyle(ButtonStyle.Secondary),
    );
  } else if (orderType === "sell") {
    embed.setColor("#BB9BF8");
    description += `selling **${amount}x** ${getItems()[itemId].emoji} **[${getItems()[itemId].name}](https://nypsi.xyz/item/${itemId})** for $${(price * amount).toLocaleString()}`;
    row.addComponents(
      new ButtonBuilder().setCustomId("market-full").setLabel("buy").setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("market-partial")
        .setLabel("buy some")
        .setStyle(ButtonStyle.Secondary),
    );
  }

  embed.setDescription(description);

  if (amount > 1) embed.setFooter({ text: `$${price.toLocaleString()} each` });

  const payload = {
    embeds: [embed],
    components: sold ? [] : [row],
  };

  const res = await client.cluster.broadcastEval(
    async (client, { payload, channelId }) => {
      const channel = client.channels.cache.get(channelId);

      if (!channel) return false;
      if (!channel.isSendable()) return false;

      try {
        const msg = await channel.send(payload);

        return msg.url;
      } catch {
        return false;
      }
    },
    {
      context: { payload, channelId: Constants.AUCTION_CHANNEL_ID },
    },
  );

  const url = res.filter((i) => Boolean(i))[0];

  const response: { sold: boolean; amount: number; url?: string } = {
    sold,
    amount,
  };

  if (!url) {
    return response;
  }

  checkMarketWatchers(itemId, amount, member, orderType, price, url);

  response.url = url;
  return response;
}

export async function updateMarketWatch(
  member: GuildMember | string,
  itemName: string,
  type: OrderType,
  priceThreshold?: number,
) {
  let userId: string;
  if (member instanceof GuildMember) {
    userId = member.user.id;
  } else {
    userId = member;
  }

  await prisma.marketWatch.upsert({
    where: {
      userId_itemId_orderType: {
        userId: userId,
        itemId: itemName,
        orderType: type,
      },
    },
    update: {
      itemId: itemName,
      priceThreshold: priceThreshold,
    },
    create: {
      userId: userId,
      itemId: itemName,
      priceThreshold: priceThreshold,
      orderType: type,
    },
  });

  return getMarketWatch(member);
}

export async function setMarketWatch(member: GuildMember | string, items: MarketWatch[]) {
  let userId: string;
  if (member instanceof GuildMember) {
    userId = member.user.id;
  } else {
    userId = member;
  }

  await prisma.marketWatch.deleteMany({ where: { userId: userId } });

  await prisma.marketWatch.createMany({ data: items });
  return items;
}

export async function deleteMarketWatch(
  member: GuildMember | string,
  type: OrderType,
  itemId: string,
) {
  let userId: string;
  if (member instanceof GuildMember) {
    userId = member.user.id;
  } else {
    userId = member;
  }

  await prisma.marketWatch.delete({
    where: {
      userId_itemId_orderType: {
        userId: userId,
        itemId: itemId,
        orderType: type,
      },
    },
  });

  return getMarketWatch(member);
}

export async function getMarketWatch(member: GuildMember | string) {
  let userId: string;
  if (member instanceof GuildMember) {
    userId = member.user.id;
  } else {
    userId = member;
  }

  return await prisma.economy
    .findUnique({
      where: {
        userId: userId,
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
  member: GuildMember | string,
  type: OrderType,
  cost: number,
  url: string,
) {
  let creatorId: string;
  if (member instanceof GuildMember) {
    creatorId = member.user.id;
  } else {
    creatorId = member;
  }

  const users = await prisma.marketWatch
    .findMany({
      where: {
        AND: [
          { itemId: itemId },
          { userId: { not: creatorId } },
          { orderType: type },
          {
            OR: [
              {
                priceThreshold:
                  type == "buy" ? { lte: Math.floor(cost) } : { gte: Math.floor(cost) },
              },
              { priceThreshold: 0 },
            ],
          },
        ],
      },
      select: {
        userId: true,
      },
    })
    .then((q) => q.map((i) => i.userId));

  const payload: NotificationPayload = {
    payload: {
      embed: new CustomEmbed().setDescription(
        `a ${type} order has made been for ${amount} ${getItems()[itemId].emoji} **[${
          amount == 1 || !getItems()[itemId].plural
            ? getItems()[itemId].name
            : getItems()[itemId].plural
        }](https://nypsi.xyz/item/${itemId})**`,
      ),
      components: new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("jump").setURL(url),
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
    (await redis.exists(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${order.itemId}`))
  ) {
    return new Promise((resolve) => {
      logger.debug(`repeating market order delete - ${id}`);
      setTimeout(async () => {
        if (repeatCount > 100) {
          inTransaction.delete(order.itemId);
          await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${order.itemId}`);
        }
        resolve(deleteMarketOrder(id, client, repeatCount + 1));
      }, 1000);
    });
  }

  await prisma.marketOrder.delete({
    where: {
      id: id,
    },
  });

  return Boolean(order);
}

export async function getPriceForMarketTransaction(
  itemId: string,
  amount: number,
  type: OrderType,
  filterOutUserId: string,
) {
  const orders = await getMarketItemOrders(itemId, type == "buy" ? "sell" : "buy", filterOutUserId);

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

export async function checkMarketOverlap(
  member: GuildMember | string,
  itemId: string,
  createdOrderType: OrderType,
  repeatCount?: number,
): Promise<boolean> {
  if (
    inTransaction.has(itemId) ||
    (await redis.exists(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`))
  ) {
    return new Promise((resolve) => {
      logger.debug(`repeating market overlap check - ${itemId}`);
      setTimeout(async () => {
        if (repeatCount > 100) inTransaction.delete(itemId);
        resolve(checkMarketOverlap(member, itemId, createdOrderType, repeatCount + 1));
      }, 50);
    });
  }

  const buyOrders = await getMarketItemOrders(itemId, "buy");
  const sellOrders = await getMarketItemOrders(itemId, "sell");

  if (buyOrders.length == 0 || sellOrders.length == 0) return false;

  const highestBuyOrder = buyOrders.reduce((prev, current) =>
    current.price > prev.price ? current : prev,
  );

  const lowestSellOrder = sellOrders.reduce((prev, current) =>
    current.price < prev.price ? current : prev,
  );

  if (highestBuyOrder.price < lowestSellOrder.price) return false;

  const sellOrdersBelowPrice = sellOrders.filter((i) => i.price <= highestBuyOrder.price);
  const buyOrdersAbovePrice = buyOrders.filter((i) => i.price >= lowestSellOrder.price);
  const countBetweenPrices = Math.min(
    sellOrdersBelowPrice.reduce((sum, item) => sum + Number(item.itemAmount), 0),
    Number(highestBuyOrder.itemAmount),
  );

  inTransaction.add(itemId);
  await redis.set(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`, "d", "EX", 600);

  setTimeout(() => {
    inTransaction.delete(itemId);
  }, ms("10 minutes"));

  let amount = countBetweenPrices;

  if (createdOrderType == "buy") {
    await completeBuy(member, itemId, countBetweenPrices, sellOrdersBelowPrice);

    for (const order of sellOrdersBelowPrice) {
      await completeSell(order.ownerId, itemId, Math.min(amount, Number(order.itemAmount)), [
        await prisma.marketOrder.findUnique({ where: { id: highestBuyOrder.id } }),
      ]);
      amount -= Math.min(amount, Number(order.itemAmount));
    }

    await addToNypsiBank(
      Number(highestBuyOrder.price - lowestSellOrder.price) * countBetweenPrices,
    );
  } else {
    await completeSell(member, itemId, countBetweenPrices, buyOrdersAbovePrice);

    for (const order of buyOrdersAbovePrice) {
      await completeBuy(order.ownerId, itemId, Math.min(amount, Number(order.itemAmount)), [
        await prisma.marketOrder.findUnique({ where: { id: lowestSellOrder.id } }),
      ]);
      amount -= Math.min(amount, Number(order.itemAmount));
    }

    await addToNypsiBank(
      Number(highestBuyOrder.price - lowestSellOrder.price) * countBetweenPrices,
    );
  }

  logger.info(`market ${itemId} fixed overlap`);

  await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
  inTransaction.delete(itemId);
  return true;
}

export async function marketBuy(
  item: Item,
  amount: number,
  storedPrice: number,
  member: GuildMember | string,
  repeatCount = 1,
) {
  let userId: string;
  if (member instanceof GuildMember) {
    userId = member.user.id;
  } else {
    userId = member;
  }

  if (
    inTransaction.has(item.id) ||
    (await redis.exists(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`))
  ) {
    return new Promise((resolve) => {
      logger.debug(`repeating market buy - ${amount}x ${item.id}`);
      setTimeout(async () => {
        if (repeatCount > 100) inTransaction.delete(item.id);
        resolve(marketBuy(item, amount, storedPrice, member, repeatCount + 1));
      }, 50);
    });
  }

  inTransaction.add(item.id);
  await redis.set(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`, "d", "EX", 600);

  if (!(await userExists(userId))) await createUser(userId);

  const buyPrice = await getPriceForMarketTransaction(item.id, amount, "buy", userId);

  if (buyPrice == -1) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`);
    inTransaction.delete(item.id);
    return "not enough items";
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

  const sellOrders = await getMarketItemOrders(item.id, "sell", userId);

  const totalTax = await completeBuy(member, item.id, amount, sellOrders);

  if (totalTax == "not enough items") return "not enough items";

  if (totalTax > 0) addToNypsiBank(totalTax);

  await Promise.all([
    addInventoryItem(member, item.id, Number(amount)),
    removeBalance(member, buyPrice),
    addStat(member, "spent-market", buyPrice - totalTax),
  ]);

  logger.info(`market ${userId} purchased ${amount} ${item.id}`);

  await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`);
  inTransaction.delete(item.id);

  return "success";
}

async function completeBuy(
  member: GuildMember | string,
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
  }[],
) {
  let userId: string;
  if (member instanceof GuildMember) {
    userId = member.user.id;
  } else {
    userId = member;
  }

  const items = getItems();
  const tax = await getTax();

  let totalTax = 0;

  const usedOrders: {
    id: number;
    price: number;
    buyAmount: number;
    itemAmount: number;
    ownerId: string;
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
      total -= Number(order.itemAmount);
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
    return "not enough items";
  }

  for (const order of usedOrders) {
    const accounts = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, order.ownerId);

    if ((order.price < 10_000 && order.itemAmount === 1) || accounts.includes(userId)) {
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
    await addStat(order.ownerId, "earned-market", order.buyAmount * order.price - taxedAmount);

    const username = await getLastKnownUsername(userId);

    transaction(
      { username: await getLastKnownUsername(order.ownerId), id: order.ownerId },
      { username: username, id: userId },
      `${itemId} x ${order.buyAmount} (market buy)`,
    );
    transaction(
      { username: username, id: userId },
      { username: await getLastKnownUsername(order.ownerId), id: order.ownerId },
      `$${(order.buyAmount * order.price - taxedAmount).toLocaleString()} (market buy)`,
    );

    if ((await getDmSettings(order.ownerId)).market) {
      if (dmQueue.has(`${order.ownerId}-sell`)) {
        if (dmQueue.get(`${order.ownerId}-sell`).items.has(itemId)) {
          if (dmQueue.get(`${order.ownerId}-sell`).items.get(itemId).has(userId)) {
            dmQueue
              .get(`${order.ownerId}-sell`)
              .items.get(itemId)
              .set(
                userId,
                dmQueue.get(`${order.ownerId}-sell`).items.get(itemId).get(userId) + amount,
              );
          } else {
            dmQueue.get(`${order.ownerId}-sell`).items.get(itemId).set(userId, amount);
          }
        } else {
          dmQueue.get(`${order.ownerId}-sell`).items.set(itemId, new Map([[userId, amount]]));
        }

        dmQueue.get(`${order.ownerId}-sell`).earned += order.buyAmount * order.price - taxedAmount;
      } else {
        dmQueue.set(`${order.ownerId}-sell`, {
          items: new Map([[itemId, new Map([[userId, amount]])]]),
          earned: order.buyAmount * order.price - taxedAmount,
        });

        setTimeout(async () => {
          if (!dmQueue.has(`${order.ownerId}-sell`)) return;
          let total = 0;
          const data = dmQueue.get(`${order.ownerId}-sell`);

          let description = "";

          for (const [item, buyers] of data.items) {
            description += `${items[item].emoji} **${items[item].name}**:\n`;

            for (const [buyer, amount] of buyers) {
              const username = await getLastKnownUsername(buyer);
              description += `- **${username}**: ${amount.toLocaleString()}\n`;
              total += amount;
            }

            description += "\n";
          }

          const embedDm = new CustomEmbed(order.ownerId)
            .setDescription(description)
            .setFooter({ text: `+$${data.earned.toLocaleString()}` });

          dmQueue.delete(`${order.ownerId}-sell`);

          addNotificationToQueue({
            memberId: order.ownerId,
            payload: {
              content: `${total.toLocaleString()}x of your sell order items have been fulfilled`,
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
  member: GuildMember | string,
  repeatCount = 1,
) {
  let userId: string;
  if (member instanceof GuildMember) {
    userId = member.user.id;
  } else {
    userId = member;
  }

  if (
    inTransaction.has(item.id) ||
    (await redis.exists(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`))
  ) {
    return new Promise((resolve) => {
      logger.debug(`repeating market sell - ${amount}x ${item.id}`);
      setTimeout(async () => {
        if (repeatCount > 100) inTransaction.delete(item.id);
        resolve(marketSell(item, amount, storedPrice, member, repeatCount + 1));
      }, 50);
    });
  }

  inTransaction.add(item.id);
  await redis.set(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`, "d", "EX", 600);

  if (!(await userExists(userId))) await createUser(userId);

  const sellPrice = await getPriceForMarketTransaction(item.id, amount, "sell", userId);

  if (sellPrice == -1) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`);
    inTransaction.delete(item.id);
    return "not enough items";
  }

  if (storedPrice !== sellPrice) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`);
    inTransaction.delete(item.id);
    return `since viewing the market, the sell price has changed from $${storedPrice.toLocaleString()} to $${sellPrice.toLocaleString()}. please press sell again with this updated price in mind`;
  }

  const inventory = await getInventory(member);

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

  const buyOrders = await getMarketItemOrders(item.id, "buy", userId);

  const totalTax = await completeSell(member, item.id, amount, buyOrders);

  if (totalTax == "not enough items") return "not enough items";

  if (totalTax > 0) addToNypsiBank(totalTax);

  await Promise.all([
    setInventoryItem(
      member,
      item.id,
      (await getInventory(member)).find((i) => i.item == item.id).amount - Number(amount),
    ),
    addBalance(member, sellPrice - totalTax),
    addStat(member, "earned-market", sellPrice - totalTax),
  ]);

  logger.info(`market ${userId} sold ${amount} ${item.id}`);

  await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${item.id}`);
  inTransaction.delete(item.id);

  return "success";
}

async function completeSell(
  member: GuildMember | string,
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
  }[],
) {
  let userId: string;
  if (member instanceof GuildMember) {
    userId = member.user.id;
  } else {
    userId = member;
  }

  const usedOrders: {
    id: number;
    price: number;
    sellAmount: number;
    itemAmount: number;
    ownerId: string;
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
      total -= Number(order.itemAmount);
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
    return "not enough items";
  }

  const items = getItems();

  const tax = await getTax();

  let totalTax = 0;

  for (const order of usedOrders) {
    const accounts = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, order.ownerId);

    if ((order.price < 10_000 && order.itemAmount === 1) || accounts.includes(userId)) {
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

    await addInventoryItem(order.ownerId, itemId, Number(amount));
    await addStat(order.ownerId, "spent-market", order.sellAmount * order.price - taxedAmount);

    const username = await getLastKnownUsername(userId);

    transaction(
      { username: await getLastKnownUsername(order.ownerId), id: order.ownerId },
      { username: username, id: userId },
      `$${(order.sellAmount * order.price - taxedAmount).toLocaleString()} (market sell)`,
    );
    transaction(
      { username: await getLastKnownUsername(userId), id: userId },
      { username: username, id: order.ownerId },
      `${itemId} x ${order.sellAmount} (market sell)`,
    );

    if ((await getDmSettings(order.ownerId)).market) {
      if (dmQueue.has(`${order.ownerId}-sell`)) {
        if (dmQueue.get(`${order.ownerId}-sell`).items.has(itemId)) {
          if (dmQueue.get(`${order.ownerId}-sell`).items.get(itemId).has(userId)) {
            dmQueue
              .get(`${order.ownerId}-sell`)
              .items.get(itemId)
              .set(
                userId,
                dmQueue.get(`${order.ownerId}-sell`).items.get(itemId).get(userId) + amount,
              );
          } else {
            dmQueue.get(`${order.ownerId}-sell`).items.get(itemId).set(userId, amount);
          }
        } else {
          dmQueue.get(`${order.ownerId}-sell`).items.set(itemId, new Map([[userId, amount]]));
        }

        dmQueue.get(`${order.ownerId}-sell`).earned += order.sellAmount * order.price - taxedAmount;
      } else {
        dmQueue.set(`${order.ownerId}-sell`, {
          items: new Map([[itemId, new Map([[userId, amount]])]]),
          earned: order.sellAmount * order.price - taxedAmount,
        });

        setTimeout(async () => {
          if (!dmQueue.has(`${order.ownerId}-buy`)) return;
          let total = 0;
          const data = dmQueue.get(`${order.ownerId}-buy`);

          let description = "";

          for (const [item, buyers] of data.items) {
            description += `${items[item].emoji} **${items[item].name}**:\n`;

            for (const [buyer, amount] of buyers) {
              const username = await getLastKnownUsername(buyer);
              description += `- **${username}**: ${amount.toLocaleString()}\n`;
              total += amount;
            }

            description += "\n";
          }

          const embedDm = new CustomEmbed(order.ownerId)
            .setDescription(description)
            .setFooter({ text: `+$${data.earned.toLocaleString()}` });

          dmQueue.delete(`${order.ownerId}-buy`);

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
