import { Market, MarketWatch, OrderType, Prisma, PrismaClient } from "@prisma/client";
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
import { addInventoryItem, getInventory, removeInventoryItem } from "./inventory";
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

  const query = await prisma.market.findMany({
    where: {
      AND: [member ? { ownerId: id } : {}, { completed: false }, { orderType: type }],
    },
    orderBy: { createdAt: "asc" },
  });

  return query;
}

export async function getMarketOrder(id: number) {
  return await prisma.market.findFirst({
    where: { id: id },
  });
}

export async function getRecentMarketOrders(type: OrderType) {
  return await prisma.market.findMany({
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
  const filters: Prisma.MarketWhereInput[] = [
    { itemId },
    { completed: false },
    { orderType: type },
  ];

  if (filterOutUserId) filters.push({ ownerId: { not: filterOutUserId } });

  const query = await prisma.market.findMany({
    where: {
      AND: filters,
    },
    orderBy: [{ price: "desc" }, { createdAt: "asc" }],
  });

  return query;
}

export async function getMarketAverage(item: string) {
  if (await redis.exists(`${Constants.redis.cache.economy.MARKET_AVG}:${item}`))
    return parseInt(await redis.get(`${Constants.redis.cache.economy.MARKET_AVG}:${item}`));

  const orders = await prisma.market.findMany({
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
    avatar = member.user.avatarURL();
  } else {
    ownerId = member;
  }

  const order = await prisma.market.create({
    data: {
      ownerId: ownerId,
      itemId: itemId,
      itemAmount: amount,
      price: price,
      orderType: orderType,
    },
  });

  const checkSold = await checkMarketOrder(order, client);
  let sold = false;

  if (checkSold) {
    const { completed, itemAmount } = await prisma.market.findFirst({
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

export async function checkMarketOrder(order: Market, client: NypsiClient, repeatCount = 0) {
  if (
    inTransaction.has(order.itemId) ||
    (await redis.exists(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${order.itemId}`))
  ) {
    return new Promise((resolve) => {
      logger.debug(`repeating market overlap check - ${order.itemId} (${repeatCount})`);
      setTimeout(async () => {
        if (repeatCount > 100) inTransaction.delete(order.itemId);
        resolve(checkMarketOrder(order, client, repeatCount + 1));
      }, 10);
    });
  }

  inTransaction.add(order.itemId);
  await redis.set(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${order.itemId}`, "t", "EX", 60);

  const validOrders = await prisma.market.findMany({
    where: {
      AND: [
        { itemId: order.itemId },
        { completed: false },
        { orderType: order.orderType === "buy" ? "sell" : "buy" },
        { price: order.orderType === "buy" ? { lte: order.price } : { gte: order.price } },
      ],
    },

    orderBy: { createdAt: "desc" },
  });

  if (validOrders.length === 0) {
    inTransaction.delete(order.itemId);
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${order.itemId}`);
    return false;
  }

  try {
    await prisma.$transaction(async (prisma) => {
      for (const validOrder of validOrders) {
        if (order.itemAmount === 0n) break;
        let amount: bigint;

        if (validOrder.itemAmount > order.itemAmount) {
          amount = order.itemAmount;
          order.itemAmount = 0n;
        } else {
          amount = validOrder.itemAmount;
          order.itemAmount -= validOrder.itemAmount;
        }

        await prisma.market.update({
          where: {
            id: order.id,
          },
          data: {
            itemAmount: order.itemAmount,
            completed: order.itemAmount === 0n ? true : undefined,
          },
        });

        const res = await completeOrder(
          validOrder.id,
          order.ownerId,
          amount,
          client,
          prisma as Prisma.TransactionClient,
        );
        if (!res) break;
      }
    });
  } catch (e) {
    console.error(e);
    logger.error("error in completing market order", e);
  }

  inTransaction.delete(order.itemId);
  await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${order.itemId}`);

  if (order.itemAmount === 0n) return true;
  else return order.itemAmount;
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
  const amount = await prisma.market.aggregate({
    where: {
      AND: [{ itemId: itemId }, { completed: false }, { orderType: type }],
    },
    _sum: {
      itemAmount: true,
    },
  });

  return amount?._sum?.itemAmount || 0;
}

export async function deleteMarketOrder(id: number, client: NypsiClient, repeatCount = 1) {
  const order = await prisma.market
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

  await prisma.market.delete({
    where: {
      id: id,
    },
  });

  return Boolean(order);
}

export async function getMarketTransactionData(
  itemId: string,
  amount: number,
  type: OrderType,
  filterOutUserId: string,
) {
  const allOrders = await prisma.market.findMany({
    where: {
      AND: [
        { itemId, completed: false },
        { orderType: type },
        { ownerId: { not: filterOutUserId } },
      ],
    },
    orderBy: [
      { price: type == "buy" ? "desc" : "asc" },
      { createdAt: "asc" },
    ],
  });
  const orders: Market[] = [];

  let cost = 0;

  for (const order of allOrders) {
    if (amount >= order.itemAmount) {
      cost += Number(order.price * order.itemAmount);
      amount -= Number(order.itemAmount);
      orders.push(order);
    } else {
      cost += Number(order.price) * amount;
      amount = 0;
      orders.push(order);
      break;
    }
  }

  return { cost: amount == 0 ? cost : -1, orders: orders };
}

export async function completeOrder(
  orderId: number,
  buyerId: string,
  amount: bigint,
  client: NypsiClient,
  prisma: PrismaClient | Prisma.TransactionClient,
  checkLock?: { itemId: string },
  repeatCount = 0,
) {
  if (checkLock) {
    if (
      inTransaction.has(checkLock.itemId) ||
      (await redis.exists(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${checkLock.itemId}`))
    ) {
      return new Promise((resolve) => {
        logger.debug(
          `repeating market overlap check (completeOrder) - ${checkLock.itemId} (${repeatCount})`,
        );
        setTimeout(async () => {
          if (repeatCount > 100) inTransaction.delete(checkLock.itemId);
          resolve(
            completeOrder(orderId, buyerId, amount, client, prisma, checkLock, repeatCount + 1),
          );
        }, 10);
      });
    }

    inTransaction.add(checkLock.itemId);
    await redis.set(
      `${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${checkLock.itemId}`,
      "t",
      "EX",
      60,
    );
  }

  const order = await prisma.market.findFirst({
    where: { AND: [{ id: orderId }, { completed: false }] },
  });

  if (!order || order.itemAmount < amount) {
    if (checkLock) {
      await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${checkLock.itemId}`);
      inTransaction.delete(checkLock.itemId);
    }

    return false;
  }

  let isAlt = false;

  const accounts = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, order.ownerId);

  if (accounts.includes(buyerId) || order.price < 10_000) isAlt = true;

  if (order.itemAmount === amount) {
    if (isAlt) {
      await prisma.market.delete({
        where: { id: order.id },
      });
    } else {
      await prisma.market.update({
        where: { id: order.id },
        data: { completed: true },
      });
    }
  } else {
    if (!isAlt) {
      await prisma.market.create({
        data: {
          itemId: order.itemId,
          orderType: order.orderType,
          ownerId: order.ownerId,
          itemAmount: amount,
          price: order.price,
          completed: true,
        },
      });
    }

    await prisma.market.update({
      where: { id: order.id },
      data: { itemAmount: { decrement: amount } },
    });
  }

  const tax = await getTax();
  let taxedAmount = 0;

  if ((await getTier(order.ownerId)) !== 4) {
    taxedAmount += Math.floor(Number(amount) * Number(order.price) * tax);
  }

  await addToNypsiBank(taxedAmount);

  if (order.orderType === "buy") {
    await addInventoryItem(order.ownerId, order.itemId, Number(amount));
    await addBalance(buyerId, Number(amount) * Number(order.price) - taxedAmount);
  } else {
    await addInventoryItem(buyerId, order.itemId, Number(amount));
    await addBalance(order.ownerId, Number(amount) * Number(order.price) - taxedAmount);
  }

  if (checkLock) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${checkLock.itemId}`);
    inTransaction.delete(checkLock.itemId);
  }

  // send logs and dms
  (async () => {
    const username = await getLastKnownUsername(buyerId);

    transaction(
      { username: await getLastKnownUsername(order.ownerId), id: order.ownerId },
      { username: username, id: buyerId },
      `${order.itemId} x ${amount} (market buy)`,
    );
    transaction(
      { username: username, id: buyerId },
      { username: await getLastKnownUsername(order.ownerId), id: order.ownerId },
      `$${(Number(amount) * Number(order.price) - taxedAmount).toLocaleString()} (market buy)`,
    );

    if ((await getDmSettings(order.ownerId)).market) {
      if (dmQueue.has(`${order.ownerId}-${order.orderType}`)) {
        if (dmQueue.get(`${order.ownerId}-${order.orderType}`).items.has(order.itemId)) {
          if (
            dmQueue.get(`${order.ownerId}-${order.orderType}`).items.get(order.itemId).has(buyerId)
          ) {
            dmQueue
              .get(`${order.ownerId}-${order.orderType}`)
              .items.get(order.itemId)
              .set(
                buyerId,
                dmQueue
                  .get(`${order.ownerId}-${order.orderType}`)
                  .items.get(order.itemId)
                  .get(buyerId) + Number(amount),
              );
          } else {
            dmQueue
              .get(`${order.ownerId}-${order.orderType}`)
              .items.get(order.itemId)
              .set(buyerId, Number(amount));
          }
        } else {
          dmQueue
            .get(`${order.ownerId}-${order.orderType}`)
            .items.set(order.itemId, new Map([[buyerId, Number(amount)]]));
        }

        dmQueue.get(`${order.ownerId}-${order.orderType}`).earned +=
          Number(amount) * Number(order.price) - taxedAmount;
      } else {
        dmQueue.set(`${order.ownerId}-${order.orderType}`, {
          items: new Map([[order.itemId, new Map([[buyerId, Number(amount)]])]]),
          earned: Number(amount) * Number(order.price) - taxedAmount,
        });

        setTimeout(async () => {
          if (!dmQueue.has(`${order.ownerId}-${order.orderType}`)) return;
          let total = 0;
          const data = dmQueue.get(`${order.ownerId}-${order.orderType}`);

          let description = "";

          for (const [item, buyers] of data.items) {
            description += `${getItems()[item].emoji} **${getItems()[item].name}**:\n`;

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

          dmQueue.delete(`${order.ownerId}-${order.orderType}`);

          addNotificationToQueue({
            memberId: order.ownerId,
            payload: {
              content: `${total.toLocaleString()}x of your ${order.orderType} order items have been fulfilled`,
              embed: embedDm,
            },
          });
        }, ms("10 minutes"));
      }
    }
  })();

  return true;
}

export async function marketSell(
  userId: string,
  itemId: string,
  amount: number,
  storedPrice: number,
  client: NypsiClient,
  repeatCount = 1,
): Promise<{ status: string; remaining?: number }> {
  if (
    inTransaction.has(itemId) ||
    (await redis.exists(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`))
  ) {
    return new Promise((resolve) => {
      logger.debug(`repeating market sell - ${amount}x ${itemId}`);
      setTimeout(async () => {
        if (repeatCount > 100) inTransaction.delete(itemId);
        resolve(marketSell(userId, itemId, amount, storedPrice, client, repeatCount + 1));
      }, 50);
    });
  }

  inTransaction.add(itemId);
  setTimeout(() => {
    inTransaction.delete(itemId);
  }, ms("10 minutes"));

  await redis.set(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`, "d", "EX", 600);

  if (!(await userExists(userId))) await createUser(userId);

  // looking for buy orders
  const { cost: sellPrice, orders } = await getMarketTransactionData(itemId, amount, "buy", userId);

  if (sellPrice == -1) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
    inTransaction.delete(itemId);
    return { status: "not enough items" };
  }

  if (storedPrice !== sellPrice) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
    inTransaction.delete(itemId);
    return {
      status: `since viewing the market, the sell price has changed from $${storedPrice.toLocaleString()} to $${sellPrice.toLocaleString()}. please press sell again with this updated price in mind`,
    };
  }

  const inventory = await getInventory(userId);

  if (
    !inventory.find((i) => i.item == itemId) ||
    inventory.find((i) => i.item == itemId).amount < amount
  ) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
    inTransaction.delete(itemId);
    return {
      status: `you do not have this many ${getItems()[itemId].plural ? getItems()[itemId].plural : getItems()[itemId].name}`,
    };
  }

  let remaining = amount;

  try {
    await prisma.$transaction(async (prisma) => {
      for (const order of orders) {
        let amount: bigint;
        if (order.itemAmount > remaining) {
          amount = BigInt(remaining);
          remaining = 0;
        } else {
          amount = order.itemAmount;
          remaining -= Number(order.itemAmount);
        }

        const res = await completeOrder(
          order.id,
          userId,
          amount,
          client,
          prisma as Prisma.TransactionClient,
        );
        if (!res) break;
      }
    });
  } catch (e) {
    console.error(e);
    logger.error("market sell transaction failed", e);
  }

  await removeInventoryItem(userId, itemId, amount - remaining);

  logger.info(`market ${userId} sold ${amount} ${itemId}`);

  await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
  inTransaction.delete(itemId);

  if (remaining) {
    return { status: "partial", remaining };
  }

  return { status: "success" };
}

export async function marketBuy(
  userId: string,
  itemId: string,
  amount: number,
  storedPrice: number,
  client: NypsiClient,
  repeatCount = 1,
): Promise<{ status: string; remaining?: number }> {
  if (
    inTransaction.has(itemId) ||
    (await redis.exists(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`))
  ) {
    return new Promise((resolve) => {
      logger.debug(`repeating market buy - ${amount}x ${itemId}`);
      setTimeout(async () => {
        if (repeatCount > 100) inTransaction.delete(itemId);
        resolve(marketBuy(userId, itemId, amount, storedPrice, client, repeatCount + 1));
      }, 50);
    });
  }

  inTransaction.add(itemId);
  setTimeout(() => {
    inTransaction.delete(itemId);
  }, ms("10 minutes"));

  await redis.set(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`, "d", "EX", 600);

  if (!(await userExists(userId))) await createUser(userId);

  // looking for sell orders
  const { cost: buyPrice, orders } = await getMarketTransactionData(itemId, amount, "sell", userId);

  if (buyPrice == -1) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
    inTransaction.delete(itemId);
    return { status: "not enough items" };
  }

  if (storedPrice !== buyPrice) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
    inTransaction.delete(itemId);
    return {
      status: `since viewing the market, the buy price has changed from $${storedPrice.toLocaleString()} to $${buyPrice.toLocaleString()}. please press buy again with this updated price in mind`,
    };
  }
  
  if ((await getBalance(userId)) < buyPrice) {
    return { status: "insufficient funds" };
  }

  let remaining = amount;

  try {
    await prisma.$transaction(async (prisma) => {
      for (const order of orders) {
        let amount: bigint;
        if (order.itemAmount > remaining) {
          amount = BigInt(remaining);
          remaining = 0;
        } else {
          amount = order.itemAmount;
          remaining -= Number(order.itemAmount);
        }

        const res = await completeOrder(
          order.id,
          userId,
          amount,
          client,
          prisma as Prisma.TransactionClient,
        );
        if (!res) break;
      }
    });
  } catch (e) {
    console.error(e);
    logger.error("market buy transaction failed", e);
  }

  await removeBalance(userId, buyPrice);

  logger.info(`market ${userId} bought ${amount} ${itemId}`);

  await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
  inTransaction.delete(itemId);

  if (remaining) {
    return { status: "partial", remaining };
  }

  return { status: "success" };
}
