import { Market, MarketWatch, OrderType, Prisma, PrismaClient } from "#generated/prisma";
import { ClusterManager } from "discord-hybrid-sharding";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed, getColor } from "../../../models/EmbedBuilders";
import { DMQueue } from "../../../types/Market";
import { NotificationPayload } from "../../../types/Notification";
import Constants from "../../Constants";
import { logger, transaction } from "../../logger";
import { findChannelCluster } from "../clusters";
import { getUserId, MemberResolvable } from "../member";
import { getAllGroupAccountIds } from "../moderation/alts";
import { filterOutliers } from "../outliers";
import { getTier } from "../premium/premium";
import { pluralize } from "../string";
import { addToNypsiBank, getTax } from "../tax";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { getLastKnownAvatar, getLastKnownUsername } from "../users/username";
import { addBalance, getBalance, removeBalance } from "./balance";
import { addInventoryItem, getInventory, isGem, removeInventoryItem } from "./inventory";
import { addStat } from "./stats";
import { createUser, getItems, userExists } from "./utils";
import ms = require("ms");

const inTransaction = new Set<string>();
/**
 * items is map of itemId -> map of userId -> amount
 */
// const dmQueue = new Map<string, { earned: number; items: Map<string, Map<string, number>> }>();

export async function getMarketOrders(member: MemberResolvable | undefined, type: OrderType) {
  const query = await prisma.market.findMany({
    where: {
      AND: [
        member ? { ownerId: getUserId(member) } : {},
        { completed: false },
        { orderType: type },
      ],
    },
    orderBy: { id: "asc" },
  });

  return query;
}

export async function getMarketOrder(id: number) {
  return await prisma.market.findUnique({
    where: { id },
  });
}

export async function setMarketOrderAmount(id: number, amount: number) {
  await prisma.market.update({
    where: {
      id,
    },
    data: {
      itemAmount: amount,
    },
  });
}

export async function getRecentMarketOrders(type: OrderType) {
  return await prisma.market.findMany({
    where: { AND: [{ completed: false }, { orderType: type }] },
    orderBy: { id: "desc" },
    take: 5,
  });
}

export async function getMarketItemOrders(
  itemId: string,
  type: OrderType,
  excludeMember?: MemberResolvable,
) {
  const filters: Prisma.MarketWhereInput[] = [
    { itemId },
    { completed: false },
    { orderType: type },
  ];

  if (excludeMember) filters.push({ ownerId: { not: getUserId(excludeMember) } });

  const query = await prisma.market.findMany({
    where: {
      AND: filters,
    },
    orderBy: [{ price: "desc" }, { id: "asc" }],
  });

  return query;
}

export async function getMarketAverage(item: string) {
  if (await redis.exists(`${Constants.redis.cache.economy.MARKET_AVG}:${item}`))
    return parseInt(await redis.get(`${Constants.redis.cache.economy.MARKET_AVG}:${item}`));

  let date: Date;

  switch (Constants.SEASON_NUMBER % 2) {
    case 0:
      // season before
      date = Constants.SEASON_START_HISTORY[Constants.SEASON_NUMBER - 2];
      break;
    case 1:
      // current season
      date = Constants.SEASON_START_HISTORY[Constants.SEASON_NUMBER - 1];
      break;
  }

  const orders = await prisma.market.findMany({
    where: {
      AND: [{ completed: true }, { itemId: item }, { createdAt: { gte: date } }],
    },
    select: {
      price: true,
    },
    orderBy: {
      id: "desc",
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
  member: MemberResolvable,
  itemId: string,
  amount: number,
  price: number,
  orderType: OrderType,
  client: NypsiClient,
) {
  const order = await prisma.market.create({
    data: {
      ownerId: getUserId(member),
      itemId: itemId,
      itemAmount: amount,
      price: price,
      orderType: orderType,
    },
  });

  const checkSold = await checkMarketOrder(order, client);
  let sold = false;

  if (checkSold) {
    const { completed, itemAmount } = await prisma.market.findUnique({
      where: {
        id: order.id,
      },
      select: {
        completed: true,
        itemAmount: true,
      },
    });

    if (completed) sold = true;
    else if (itemAmount !== amount) amount = itemAmount;
  }

  const response: { sold: boolean; amount: number; url?: string } = {
    sold,
    amount,
  };

  if (sold) return response;

  order.itemAmount = amount;

  const payload = await getMarketOrderEmbed(order);

  const cluster = await findChannelCluster(client, Constants.MARKET_CHANNEL_ID);

  if (cluster) {
    const { url, id } = await client.cluster
      .broadcastEval(
        async (client, { payload, channelId, cluster }) => {
          const c = client as unknown as NypsiClient;

          if (c.cluster.id !== cluster) return;

          const channel = client.channels.cache.get(channelId);

          if (!channel) return;
          if (!channel.isSendable()) return;

          try {
            const msg = await channel.send(payload);

            return { url: msg.url, id: msg.id };
          } catch {
            return;
          }
        },
        {
          context: { payload, channelId: Constants.MARKET_CHANNEL_ID, cluster: cluster.cluster },
        },
      )
      .then((res) => {
        return res.filter((i) => Boolean(i))[0];
      });

    if (!url) {
      return response;
    }

    await prisma.market.update({
      where: {
        id: order.id,
      },
      data: {
        messageId: id,
      },
    });

    response.url = url;

    checkMarketWatchers(itemId, amount, member, orderType, price, url);
  }

  addStat(member, `market-created-${orderType}`);

  return response;
}

export async function getMarketOrderEmbed(order: Market) {
  const embed = new CustomEmbed(order.ownerId);
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

  embed.setHeader(
    await getLastKnownUsername(order.ownerId, false),
    await getLastKnownAvatar(order.ownerId),
    `https://nypsi.xyz/users/${order.ownerId}?ref=bot-market`,
  );

  let description: string;

  if (order.completed) {
    description = `fulfilled <t:${Math.floor(Date.now() / 1000)}:R>\n\n`;
  } else {
    description = `created <t:${Math.floor(order.createdAt.getTime() / 1000)}:R>\n\n`;
  }

  if (order.orderType === "buy") {
    embed.setColor("#b4befe");
    description += `buying **${order.itemAmount.toLocaleString()}x** ${getItems()[order.itemId].emoji} **[${getItems()[order.itemId].name}](https://nypsi.xyz/items/${order.itemId}?ref=bot-market)** for $${(Number(order.price) * order.itemAmount).toLocaleString()}`;
    row.addComponents(
      new ButtonBuilder().setCustomId("market-full").setLabel("sell").setStyle(ButtonStyle.Success),
    );
    if (order.itemAmount >= 10)
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("market-partial")
          .setLabel("sell some")
          .setStyle(ButtonStyle.Secondary),
      );
    else if (order.itemAmount > 1)
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("market-one")
          .setLabel("sell one")
          .setStyle(ButtonStyle.Secondary),
      );
  } else if (order.orderType === "sell") {
    embed.setColor("#a6e3a1");
    description += `selling **${order.itemAmount.toLocaleString()}x** ${getItems()[order.itemId].emoji} **[${getItems()[order.itemId].name}](https://nypsi.xyz/items/${order.itemId}?ref=bot-market)** for $${(Number(order.price) * order.itemAmount).toLocaleString()}`;
    row.addComponents(
      new ButtonBuilder().setCustomId("market-full").setLabel("buy").setStyle(ButtonStyle.Success),
    );
    if (order.itemAmount >= 10)
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("market-partial")
          .setLabel("buy some")
          .setStyle(ButtonStyle.Secondary),
      );
    else if (order.itemAmount > 1)
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("market-one")
          .setLabel("buy one")
          .setStyle(ButtonStyle.Secondary),
      );
  }

  embed.setDescription(description);

  if (order.itemAmount > 1) embed.setFooter({ text: `$${order.price.toLocaleString()} each` });

  return {
    embeds: [embed],
    components: order.completed ? [] : [row],
  };
}

export async function checkMarketOrder(
  order: Market,
  client: NypsiClient,
  repeatCount = 0,
): Promise<boolean | number> {
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
        { ownerId: { not: order.ownerId } },
      ],
    },
    orderBy: { id: "desc" },
  });

  if (validOrders.length === 0) {
    inTransaction.delete(order.itemId);
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${order.itemId}`);
    return false;
  }

  let excessMoney = 0n;
  let remaining = order.itemAmount;

  try {
    await prisma.$transaction(async (prisma) => {
      for (const validOrder of validOrders) {
        let amount: number;

        if (validOrder.itemAmount > remaining) {
          amount = remaining;
          remaining = 0;
        } else {
          amount = validOrder.itemAmount;
          remaining -= validOrder.itemAmount;
        }

        if (amount === 0) break;

        const res = await completeOrder(
          validOrder.id,
          order.ownerId,
          amount,
          client,
          prisma as Prisma.TransactionClient,
        );

        if (validOrder.price > order.price) {
          excessMoney += (validOrder.price - order.price) * BigInt(amount);
        }

        if (!res) break;
      }

      if (remaining === 0) {
        await prisma.market.update({
          where: {
            id: order.id,
          },
          data: {
            completed: true,
          },
        });
      } else if (remaining < order.itemAmount) {
        await prisma.market.update({
          where: {
            id: order.id,
          },
          data: {
            itemAmount: remaining,
          },
        });

        if (order.price > 10_000) {
          await prisma.market.create({
            data: {
              ownerId: order.ownerId,
              itemId: order.itemId,
              itemAmount: order.itemAmount - remaining,
              orderType: order.orderType,
              price: order.price,
              completed: true,
            },
          });
        }
      }
    });
  } catch (e) {
    console.error(e);
    logger.error("error in completing market order", e);
  }

  await addToNypsiBank(Number(excessMoney));

  inTransaction.delete(order.itemId);
  await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${order.itemId}`);

  if (remaining === 0) return true;
  else return remaining;
}

export async function updateMarketWatch(
  member: MemberResolvable,
  itemName: string,
  type: OrderType,
  priceThreshold?: number,
) {
  const userId = getUserId(member);

  await prisma.marketWatch.upsert({
    where: {
      userId_itemId_orderType: {
        userId,
        itemId: itemName,
        orderType: type,
      },
    },
    update: {
      itemId: itemName,
      priceThreshold: priceThreshold,
    },
    create: {
      userId,
      itemId: itemName,
      priceThreshold: priceThreshold,
      orderType: type,
    },
  });

  return getMarketWatch(member, type);
}

export async function setMarketWatch(member: MemberResolvable, items: MarketWatch[]) {
  await prisma.marketWatch.deleteMany({ where: { userId: getUserId(member) } });

  await prisma.marketWatch.createMany({ data: items });
  return items;
}

export async function deleteMarketWatch(member: MemberResolvable, type: OrderType, itemId: string) {
  await prisma.marketWatch.delete({
    where: {
      userId_itemId_orderType: {
        userId: getUserId(member),
        itemId: itemId,
        orderType: type,
      },
    },
  });

  return getMarketWatch(member, type);
}

export async function getMarketWatch(member: MemberResolvable, type: OrderType) {
  return (
    await prisma.economy
      .findUnique({
        where: {
          userId: getUserId(member),
        },
        select: {
          MarketWatch: true,
        },
      })
      .then((q) => q.MarketWatch)
  ).filter((i) => i.orderType == type);
}

export async function checkMarketWatchers(
  itemId: string,
  amount: number,
  member: MemberResolvable,
  type: OrderType,
  cost: number,
  url: string,
) {
  const users = await prisma.marketWatch
    .findMany({
      where: {
        AND: [
          { itemId: itemId },
          { userId: { not: getUserId(member) } },
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
        `a ${type} order has made been for ${amount} ${getItems()[itemId].emoji} **[${pluralize(getItems()[itemId], amount)}](https://nypsi.xyz/items/${itemId}?ref=bot-market)**`,
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

export async function deleteMarketOrder(
  id: number,
  client: NypsiClient | ClusterManager | undefined,
  repeatCount = 1,
) {
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

  if (order.messageId && client) {
    await (client instanceof ClusterManager ? client : client.cluster).broadcastEval(
      async (client, { channelId, guildId, messageId }) => {
        const guild = client.guilds.cache.get(guildId);

        if (!guild) return "no-guild";

        const channel = guild.channels.cache.get(channelId);

        if (!channel) return "no-channel";

        if (!channel.isTextBased()) return "invalid-channel";

        const message = await channel.messages.fetch(messageId).catch(() => {});

        if (!message) return "no-message";

        await message.delete().catch(() => {});
      },
      {
        context: {
          guildId: Constants.NYPSI_SERVER_ID,
          channelId: Constants.MARKET_CHANNEL_ID,
          messageId: order.messageId,
        },
      },
    );
  }

  return Boolean(order);
}

export async function getMarketTransactionData(
  itemId: string,
  amount: number,
  type: OrderType,
  excludeMember: MemberResolvable,
) {
  const allOrders = await prisma.market.findMany({
    where: {
      AND: [
        { itemId, completed: false },
        { orderType: type },
        { ownerId: { not: getUserId(excludeMember) } },
      ],
    },
    orderBy: [{ price: type == "buy" ? "desc" : "asc" }, { id: "asc" }],
  });
  const orders: Market[] = [];

  let cost = 0;

  for (const order of allOrders) {
    if (amount >= order.itemAmount) {
      cost += Number(order.price) * order.itemAmount;
      amount -= order.itemAmount;
      orders.push(order);
      if (amount <= 0) break;
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
  buyer: MemberResolvable,
  amount: number,
  client: NypsiClient,
  prisma: PrismaClient | Prisma.TransactionClient,
  checkLock?: { itemId: string },
  repeatCount = 0,
): Promise<boolean> {
  const buyerId = getUserId(buyer);

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
    order.completed = true;
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
    order.itemAmount -= amount;
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

    addStat(buyerId, "market-sold-items", Number(amount));
    addStat(buyerId, "earned-market", Number(amount) * Number(order.price) - taxedAmount);
    addStat(order.ownerId, "market-fulfilled-buy", Number(amount));
    addStat(order.ownerId, "spent-market", Number(amount) * Number(order.price));
  } else {
    await addInventoryItem(buyerId, order.itemId, Number(amount));
    await addBalance(order.ownerId, Number(amount) * Number(order.price) - taxedAmount);

    if (isGem(order.itemId))
      await redis.del(`${Constants.redis.cache.economy.HAS_GEM}:${order.ownerId}:${order.itemId}`);

    addStat(buyerId, "market-bought-items", Number(amount));
    addStat(buyerId, "spent-market", Number(amount) * Number(order.price));
    addStat(order.ownerId, "market-fulfilled-sell", Number(amount));
    addStat(order.ownerId, "earned-market", Number(amount) * Number(order.price) - taxedAmount);
  }

  if (checkLock) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${checkLock.itemId}`);
    inTransaction.delete(checkLock.itemId);
  }

  // send logs and dms
  (async () => {
    transaction(order.ownerId, buyerId, "item", amount, order.itemId, "market");
    transaction(
      buyerId,
      order.ownerId,
      "money",
      Number(amount) * Number(order.price) - taxedAmount,
      undefined,
      "market",
    );

    if ((await getDmSettings(order.ownerId)).market) {
      let dmQueue = await redis
        .hget(`${Constants.redis.nypsi.MARKET_DM}:${order.orderType}`, order.ownerId)
        .then((r) => (r ? (JSON.parse(r) as DMQueue) : undefined));

      if (!dmQueue) {
        dmQueue = { userId: order.ownerId, createdAt: Date.now(), earned: 0, items: {} };
      }

      dmQueue.earned += Number(amount) * Number(order.price) - taxedAmount;

      if (dmQueue.items[order.itemId]) {
        if (dmQueue.items[order.itemId][buyerId]) {
          dmQueue.items[order.itemId][buyerId] += Number(amount);
        } else {
          dmQueue.items[order.itemId][buyerId] = Number(amount);
        }
      } else {
        dmQueue.items[order.itemId] = { [buyerId]: Number(amount) };
      }

      await redis.hset(
        `${Constants.redis.nypsi.MARKET_DM}:${order.orderType}`,
        order.ownerId,
        JSON.stringify(dmQueue),
      );
    }
  })();

  (async () => {
    if (order.messageId) {
      const embed = await getMarketOrderEmbed(order);

      await client.cluster.broadcastEval(
        async (client, { channelId, messageId, embed }) => {
          const channel = client.channels.cache.get(channelId) as TextChannel;

          if (!channel || !channel.isTextBased()) return "no-channel";

          const msg = await channel.messages.fetch(messageId).catch(() => {});

          if (!msg) return "no-msg";

          await msg.edit(embed).catch(() => {});
        },
        {
          context: {
            channelId: Constants.MARKET_CHANNEL_ID,
            messageId: order.messageId,
            embed,
          },
        },
      );
    }
  })();

  return true;
}

export async function marketSell(
  member: MemberResolvable,
  itemId: string,
  amount: number,
  storedPrice: number,
  client: NypsiClient,
  orderId?: number,
  repeatCount = 1,
): Promise<{ status: string; remaining: number }> {
  const userId = getUserId(member);

  if (
    inTransaction.has(itemId) ||
    (await redis.exists(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`))
  ) {
    return new Promise((resolve) => {
      logger.debug(`repeating market sell - ${amount}x ${itemId}`);
      setTimeout(async () => {
        if (repeatCount > 100) inTransaction.delete(itemId);
        resolve(marketSell(userId, itemId, amount, storedPrice, client, orderId, repeatCount + 1));
      }, 50);
    });
  }

  inTransaction.add(itemId);
  setTimeout(() => {
    inTransaction.delete(itemId);
  }, ms("3 minutes"));

  await redis.set(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`, "d", "EX", 600);

  if (!(await userExists(userId))) await createUser(userId);

  let order: Market;

  if (orderId) {
    order = await prisma.market.findUnique({
      where: { id: orderId },
    });

    if (!order || order.itemAmount < amount) {
      await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
      inTransaction.delete(itemId);
      return { status: "too slow ):", remaining: -1 };
    }
  }

  // looking for buy orders
  const { cost: sellPrice, orders } = orderId
    ? { cost: Number(order.price) * amount, orders: [order] }
    : await getMarketTransactionData(itemId, amount, "buy", userId);

  if (orderId) {
    if (orders[0].completed || orders[0].itemAmount < amount) {
      await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
      inTransaction.delete(itemId);
      return { status: "too slow ):", remaining: -1 };
    }
  }

  if (sellPrice == -1) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
    inTransaction.delete(itemId);
    return { status: "not enough items", remaining: -1 };
  }

  if (storedPrice !== sellPrice) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
    inTransaction.delete(itemId);
    return {
      status: `since viewing the market, the sell price has changed from $${storedPrice.toLocaleString()} to $${sellPrice.toLocaleString()}. please press sell again with this updated price in mind`,
      remaining: -1,
    };
  }

  const inventory = await getInventory(userId);

  if (inventory.count(itemId) < amount) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
    inTransaction.delete(itemId);
    return {
      status: `you do not have this many ${getItems()[itemId].plural}`,
      remaining: -1,
    };
  }

  let remaining = amount;

  try {
    await prisma.$transaction(async (prisma) => {
      for (const order of orders) {
        let amount: number;
        if (order.itemAmount > remaining) {
          amount = remaining;
          remaining = 0;
        } else {
          amount = order.itemAmount;
          remaining -= order.itemAmount;
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

    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
    inTransaction.delete(itemId);

    return { status: "internal error", remaining: -1 };
  }

  await removeInventoryItem(userId, itemId, amount - remaining);

  logger.info(
    `market: ${userId} (${await getLastKnownUsername(userId, false)}) sold ${amount} ${itemId}`,
  );

  await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
  inTransaction.delete(itemId);

  if (remaining) {
    return { status: "partial", remaining };
  }

  return { status: "success", remaining };
}

export async function marketBuy(
  member: MemberResolvable,
  itemId: string,
  amount: number,
  storedPrice: number,
  client: NypsiClient,
  orderId?: number,
  repeatCount = 1,
): Promise<{ status: string; remaining: number }> {
  const userId = getUserId(member);

  if (
    inTransaction.has(itemId) ||
    (await redis.exists(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`))
  ) {
    return new Promise((resolve) => {
      logger.debug(`repeating market buy - ${amount}x ${itemId}`);
      setTimeout(async () => {
        if (repeatCount > 100) inTransaction.delete(itemId);
        resolve(marketBuy(userId, itemId, amount, storedPrice, client, orderId, repeatCount + 1));
      }, 50);
    });
  }

  inTransaction.add(itemId);
  setTimeout(() => {
    inTransaction.delete(itemId);
  }, ms("3 minutes"));

  await redis.set(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`, "d", "EX", 600);

  if (!(await userExists(userId))) await createUser(userId);

  let order: Market;

  if (orderId) {
    order = await prisma.market.findUnique({
      where: { id: orderId },
    });

    if (!order || order.itemAmount < amount) {
      await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
      inTransaction.delete(itemId);
      return { status: "too slow ):", remaining: -1 };
    }
  }

  // looking for sell orders
  const { cost: buyPrice, orders } = orderId
    ? { cost: Number(order.price) * amount, orders: [order] }
    : await getMarketTransactionData(itemId, amount, "sell", userId);

  if (orderId) {
    if (orders[0].completed || orders[0].itemAmount < amount) {
      await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
      inTransaction.delete(itemId);
      return { status: "too slow ):", remaining: -1 };
    }
  }

  if (buyPrice == -1) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
    inTransaction.delete(itemId);
    return { status: "not enough items", remaining: -1 };
  }

  if (storedPrice !== buyPrice) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
    inTransaction.delete(itemId);
    return {
      status: `since viewing the market, the buy price has changed from $${storedPrice.toLocaleString()} to $${buyPrice.toLocaleString()}. please press buy again with this updated price in mind`,
      remaining: -1,
    };
  }

  if ((await getBalance(userId)) < buyPrice) {
    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
    inTransaction.delete(itemId);
    return { status: "insufficient funds", remaining: -1 };
  }

  let remaining = amount;

  try {
    await prisma.$transaction(async (prisma) => {
      for (const order of orders) {
        let amount: number;
        if (order.itemAmount > remaining) {
          amount = remaining;
          remaining = 0;
        } else {
          amount = order.itemAmount;
          remaining -= order.itemAmount;
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

    await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
    inTransaction.delete(itemId);

    return { status: "internal error", remaining: -1 };
  }

  await removeBalance(userId, buyPrice);

  logger.info(
    `market: ${userId} (${await getLastKnownUsername(userId, false)}) bought ${amount} ${itemId}`,
  );

  await redis.del(`${Constants.redis.nypsi.MARKET_IN_TRANSACTION}:${itemId}`);
  inTransaction.delete(itemId);

  if (remaining) {
    return { status: "partial", remaining };
  }

  return { status: "success", remaining };
}

export async function showMarketConfirmationModal(
  interaction: ButtonInteraction,
  action: OrderType,
  cost: number,
) {
  const id = `market-confirm-${Math.floor(Math.random() * 69420)}`;

  const modal = new ModalBuilder().setCustomId(id).setTitle("confirmation");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("confirmation")
        .setLabel("type 'yes' to confirm")
        .setPlaceholder(
          action == "buy"
            ? `this will cost $${cost.toLocaleString()}`
            : `the average worth of this item is $${cost.toLocaleString()}`,
        )
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3),
    ),
  );

  await interaction.showModal(modal);

  const filter = (i: ModalSubmitInteraction) =>
    i.user.id == interaction.user.id && i.customId === id;

  const res = await interaction.awaitModalSubmit({ filter, time: 30000 }).catch(() => {});

  if (!res) return;

  if (!res.isModalSubmit()) return;

  if (res.fields.getTextInputValue("confirmation") != "yes") {
    res.reply({
      embeds: [new CustomEmbed().setDescription("✅ cancelled purchase")],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  res.deferUpdate();

  return true;
}
