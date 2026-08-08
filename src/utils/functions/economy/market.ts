import { ClusterManager } from "discord-hybrid-sharding";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  LabelBuilder,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { Market, MarketWatch, OrderType, Prisma } from "#generated/prisma";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed, getColor } from "../../../models/EmbedBuilders";
import { DMQueue } from "../../../types/Market";
import { NotificationPayload } from "../../../types/Notification";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { transaction } from "../../discord-logs";
import { logger } from "../../logger";
import { findChannelCluster } from "../clusters";
import { getUserId, MemberResolvable } from "../member";
import { getAllGroupAccountIds } from "../moderation/alts";
import { RedisMutex } from "../mutex";
import { filterOutliers } from "../outliers";
import { getTier } from "../premium/premium";
import { pluralize } from "../string";
import { getTax } from "../tax";
import { addNotificationToQueue } from "../users/notifications";
import { getPreferences } from "../users/preferences";
import { getLastKnownAvatar, getLastKnownUsername } from "../users/username";
import { getBalance } from "./balance";
import { autosellInventoryItem, getInventory, isGem } from "./inventory";
import { quoteMarketOrder } from "./market/matching";
import {
  escrowMarketOrderAssets,
  MarketEscrowError,
  settleMarketFill,
  SettledMarketFill,
  updateIncomingMarketOrder,
} from "./market/settlement";
import { addStat } from "./stats";
import { createUser, getItems, userExists } from "./utils";

const marketMutex = new RedisMutex("market", true, 10 * 60 * 1000);
const marketAverageCache = new RedisCache<number>(
  Constants.redis.cache.economy.MARKET_AVG,
  3 * 60 * 60,
);

export type CreateMarketOrderResult =
  | { error: "insufficient_balance" | "insufficient_inventory" }
  | {
      amount: number;
      fills: { amount: number; price: bigint }[];
      url?: string;
    };

async function withMarketLock<T>(itemId: string, operation: () => Promise<T>): Promise<T> {
  await marketMutex.acquire(itemId);

  try {
    return await operation();
  } finally {
    marketMutex.release(itemId);
  }
}

async function lockMarketRows(
  prisma: Prisma.TransactionClient,
  itemId: string,
  orderIds: number[],
) {
  const advisoryStartedAt = Date.now();

  logger.debug("market: waiting for postgres advisory lock", { itemId });
  await prisma.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('market'), hashtext(${itemId}))`;
  logger.debug("market: acquired postgres advisory lock", {
    itemId,
    waitMs: Date.now() - advisoryStartedAt,
  });

  if (orderIds.length === 0) return;

  const sortedOrderIds = [...orderIds].sort((a, b) => a - b);
  const rowsStartedAt = Date.now();

  logger.debug("market: waiting for postgres row locks", {
    itemId,
    orderCount: sortedOrderIds.length,
    orderIds: sortedOrderIds,
  });
  await prisma.$queryRaw`SELECT "id" FROM "Market" WHERE "id" IN (${Prisma.join(
    sortedOrderIds,
  )}) ORDER BY "id" FOR UPDATE`;
  logger.debug("market: acquired postgres row locks", {
    itemId,
    orderCount: sortedOrderIds.length,
    orderIds: sortedOrderIds,
    waitMs: Date.now() - rowsStartedAt,
  });
}

export async function marketSell(
  member: MemberResolvable,
  itemId: string,
  amount: number,
  storedPrice: number,
  client: NypsiClient,
  orderId?: number,
): Promise<{ status: string; remaining: number }> {
  return withMarketLock(itemId, () =>
    marketSellUnlocked(member, itemId, amount, storedPrice, client, orderId),
  );
}

export async function marketBuy(
  member: MemberResolvable,
  itemId: string,
  amount: number,
  storedPrice: number,
  client: NypsiClient,
  orderId?: number,
): Promise<{ status: string; remaining: number }> {
  return withMarketLock(itemId, () =>
    marketBuyUnlocked(member, itemId, amount, storedPrice, client, orderId),
  );
}

export async function createMarketOrder(
  member: MemberResolvable,
  itemId: string,
  amount: number,
  price: number,
  orderType: OrderType,
  client: NypsiClient,
): Promise<CreateMarketOrderResult> {
  return withMarketLock(itemId, () =>
    createMarketOrderUnlocked(member, itemId, amount, price, orderType, client),
  );
}

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
  const cache = await marketAverageCache.get(item);
  if (cache !== null) return cache;

  const date = Constants.SEASON_START_HISTORY[Math.max(0, Constants.SEASON_NUMBER - 2)];

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

  await marketAverageCache.set(item, avg);

  return avg;
}

async function createMarketOrderUnlocked(
  member: MemberResolvable,
  itemId: string,
  amount: number,
  price: number,
  orderType: OrderType,
  client: NypsiClient,
): Promise<CreateMarketOrderResult> {
  const ownerId = getUserId(member);
  const [taxRate, seasonInterim] = await Promise.all([
    getTax(),
    redis.exists(Constants.redis.nypsi.INFINITE_MAX_BET).then(Boolean),
  ]);

  let creation: { fills: SettledMarketFill[]; order: Market; remainingAmount: number };

  logger.debug("market: starting atomic order creation", {
    amount,
    itemId,
    orderType,
    ownerId,
    price,
  });

  try {
    creation = await prisma.$transaction(
      async (tx) => {
        const transaction = tx as Prisma.TransactionClient;
        await lockMarketRows(transaction, itemId, []);

        const filters: Prisma.MarketWhereInput = {
          itemId,
          completed: false,
          orderType: orderType === "buy" ? "sell" : "buy",
          price: orderType === "buy" ? { lte: price } : { gte: price },
          ownerId: { not: ownerId },
        };
        let candidateOrders = await tx.market.findMany({ where: filters });
        const candidateIds = candidateOrders.map((order) => order.id).sort((a, b) => a - b);

        if (candidateIds.length > 0) {
          await lockMarketRows(transaction, itemId, candidateIds);
          candidateOrders = await tx.market.findMany({ where: filters });
        }

        const quote = quoteMarketOrder(candidateOrders, {
          side: orderType,
          amount,
          limitPrice: BigInt(price),
          ownerId,
        });
        const policies = await prepareMarketFillPolicies(quote.fills, ownerId);

        await escrowMarketOrderAssets(transaction, {
          amount,
          itemId,
          orderType,
          price: BigInt(price),
          userId: ownerId,
        });

        const order = await tx.market.create({
          data: { ownerId, itemId, itemAmount: amount, price, orderType },
        });
        const fills: SettledMarketFill[] = [];

        for (const fill of quote.fills) {
          const policy = policies.get(fill.order.id)!;
          const result = await settleMarketFill(transaction, {
            orderId: fill.order.id,
            incomingUserId: ownerId,
            amount: fill.amount,
            taxRate,
            sellerTaxExempt: policy.sellerTaxExempt,
            incomingAssetsEscrowed: true,
            incomingLimitPrice: BigInt(price),
            isAlt: policy.isAlt,
            seasonInterim,
          });

          if (!result) throw new Error("market order changed during creation settlement");

          fills.push(result);
        }

        const filledAmount = fills.reduce((total, fill) => total + fill.amount, 0);
        const remainingAmount =
          filledAmount > 0
            ? await updateIncomingMarketOrder(transaction, order, filledAmount, seasonInterim)
            : amount;

        return { fills, order, remainingAmount };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof MarketEscrowError) {
      logger.debug("market: order creation rejected during escrow", {
        amount,
        itemId,
        orderType,
        ownerId,
        price,
        reason: error.reason,
      });
      return { error: error.reason };
    }

    logger.error("market: atomic order creation failed", {
      amount,
      error,
      itemId,
      orderType,
      ownerId,
      price,
    });
    throw error;
  }

  logger.debug("market: atomic order creation committed", {
    filledAmount: creation.fills.reduce((total, fill) => total + fill.amount, 0),
    itemId,
    orderId: creation.order.id,
    orderType,
    ownerId,
    remainingAmount: creation.remainingAmount,
  });

  await invalidateMarketOrderCreationCaches(ownerId, itemId, orderType);
  await invalidateMarketSettlementCaches(creation.fills);
  await processMarketAutosell(creation.fills, client);
  publishMarketSettlements(creation.fills, client);

  const response: CreateMarketOrderResult = {
    amount: creation.remainingAmount,
    fills: creation.fills.map((fill) => ({ amount: fill.amount, price: fill.price })),
  };

  if (creation.remainingAmount === 0) return response;

  creation.order.itemAmount = creation.remainingAmount;

  const payload = await getMarketOrderEmbed(creation.order);
  const cluster = await findChannelCluster(client, Constants.MARKET_CHANNEL_ID);

  if (cluster) {
    const result = await client.cluster
      .broadcastEval(
        async (client, { payload, channelId, cluster }) => {
          const c = client as unknown as NypsiClient;

          if (c.cluster.id !== cluster) return;

          const channel = client.channels.cache.get(channelId);

          if (!channel?.isSendable()) return;

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
      .then((results) => results.find(Boolean));

    if (result) {
      await prisma.market.update({
        where: { id: creation.order.id },
        data: { messageId: result.id },
      });

      response.url = result.url;
      checkMarketWatchers(itemId, creation.remainingAmount, member, orderType, price, result.url);
    }
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
    if (!(await getPreferences(userId)).dms.market) continue;

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
) {
  const existingOrder = await prisma.market
    .findFirst({
      where: {
        AND: [{ id: id }, { completed: false }],
      },
    })
    .catch(() => {});

  if (!existingOrder) return false;

  const order = await withMarketLock(existingOrder.itemId, async () => {
    const order = await prisma.market.findFirst({
      where: {
        AND: [{ id }, { completed: false }],
      },
    });

    if (!order) return;

    await prisma.market.delete({ where: { id } });

    return order;
  });

  if (!order) return false;

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
  });
  const quote = quoteMarketOrder(allOrders, {
    side: type === "sell" ? "buy" : "sell",
    amount,
    ownerId: getUserId(excludeMember),
  });

  return {
    cost: quote.remainingAmount === 0 ? Number(quote.total) : -1,
    fills: quote.fills,
    orders: quote.fills.map((fill) => fill.order),
  };
}

type MarketFillPolicy = {
  isAlt: boolean;
  sellerTaxExempt: boolean;
};

async function prepareMarketFillPolicies(
  fills: { order: Market }[],
  incomingUserId: string,
): Promise<Map<number, MarketFillPolicy>> {
  const policies = await Promise.all(
    fills.map(async ({ order }) => {
      const sellerId = order.orderType === "buy" ? incomingUserId : order.ownerId;
      const isAlt =
        order.price < 10_000 ||
        (await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, order.ownerId)).includes(
          incomingUserId,
        );

      return {
        orderId: order.id,
        isAlt,
        sellerTaxExempt: (await getTier(sellerId)) === 4,
      };
    }),
  );

  return new Map(policies.map(({ orderId, ...policy }) => [orderId, policy]));
}

async function settleMarketFills(request: {
  fills: { order: Market; amount: number }[];
  incomingUserId: string;
  requestedAmount: number;
  incomingAssetsEscrowed: boolean;
  incomingLimitPrice?: bigint;
  incomingOrder?: Market;
}) {
  const context = {
    fills: request.fills.map((fill) => ({
      amount: fill.amount,
      orderId: fill.order.id,
      price: fill.order.price,
      side: fill.order.orderType,
    })),
    incomingAssetsEscrowed: request.incomingAssetsEscrowed,
    incomingLimitPrice: request.incomingLimitPrice,
    incomingOrderId: request.incomingOrder?.id,
    incomingUserId: request.incomingUserId,
    requestedAmount: request.requestedAmount,
  };

  logger.debug("market: starting settlement", context);

  try {
    const [policies, taxRate, seasonInterim] = await Promise.all([
      prepareMarketFillPolicies(request.fills, request.incomingUserId),
      getTax(),
      redis.exists(Constants.redis.nypsi.INFINITE_MAX_BET).then(Boolean),
    ]);

    const settlement = await prisma.$transaction(
      async (tx) => {
        const transaction = tx as Prisma.TransactionClient;
        const itemId = request.incomingOrder?.itemId ?? request.fills[0]?.order.itemId;
        const results: SettledMarketFill[] = [];

        if (!itemId) throw new Error("market settlement requires an item");

        await lockMarketRows(
          transaction,
          itemId,
          request.fills.map((fill) => fill.order.id),
        );

        for (const fill of request.fills) {
          const policy = policies.get(fill.order.id)!;
          const result = await settleMarketFill(transaction, {
            orderId: fill.order.id,
            incomingUserId: request.incomingUserId,
            amount: fill.amount,
            taxRate,
            sellerTaxExempt: policy.sellerTaxExempt,
            incomingAssetsEscrowed: request.incomingAssetsEscrowed,
            incomingLimitPrice: request.incomingLimitPrice,
            isAlt: policy.isAlt,
            seasonInterim,
          });

          if (!result) throw new Error("market order changed during settlement");

          results.push(result);
        }

        const filledAmount = results.reduce((total, fill) => total + fill.amount, 0);
        const remainingAmount = request.incomingOrder
          ? await updateIncomingMarketOrder(
              transaction,
              request.incomingOrder,
              filledAmount,
              seasonInterim,
            )
          : request.requestedAmount - filledAmount;

        return { fills: results, remainingAmount };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    logger.debug("market: settlement committed", {
      ...context,
      filledAmount: settlement.fills.reduce((total, fill) => total + fill.amount, 0),
      remainingAmount: settlement.remainingAmount,
      results: settlement.fills.map((fill) => ({
        amount: fill.amount,
        buyerId: fill.buyerId,
        gross: fill.gross,
        orderId: fill.restingOrderId,
        price: fill.price,
        refund: fill.incomingRefund,
        sellerId: fill.sellerId,
        sellerProceeds: fill.sellerProceeds,
        sellerTax: fill.sellerTax,
      })),
    });

    return settlement;
  } catch (error) {
    logger.error("market: settlement failed", { ...context, error });
    throw error;
  }
}

async function invalidateMarketOrderCreationCaches(
  userId: string,
  itemId: string,
  orderType: OrderType,
) {
  const keys =
    orderType === "buy"
      ? [`${Constants.redis.cache.economy.BALANCE}:${userId.toLowerCase()}`]
      : [
          `${Constants.redis.cache.economy.INVENTORY}:${userId.toLowerCase()}`,
          `${Constants.redis.cache.economy.ITEM_EXISTS}:${itemId}`,
        ];

  if (orderType === "sell" && isGem(itemId)) {
    keys.push(`${Constants.redis.cache.economy.HAS_GEM}:${userId}:${itemId}`.toLowerCase());
  }

  await redis.del(...keys);
}

async function invalidateMarketSettlementCaches(fills: SettledMarketFill[]) {
  const balanceUsers = new Set<string>();
  const inventoryUsers = new Set<string>();
  const itemIds = new Set<string>();

  for (const fill of fills) {
    balanceUsers.add(fill.sellerId);
    inventoryUsers.add(fill.buyerId);
    itemIds.add(fill.itemId);

    if (fill.incomingMoneyDebit > 0n || fill.incomingRefund > 0n) {
      balanceUsers.add(fill.incomingUserId);
    }

    if (fill.incomingItemDebit > 0) inventoryUsers.add(fill.incomingUserId);
  }

  const keys = [
    ...Array.from(
      balanceUsers,
      (userId) => `${Constants.redis.cache.economy.BALANCE}:${userId.toLowerCase()}`,
    ),
    ...Array.from(
      inventoryUsers,
      (userId) => `${Constants.redis.cache.economy.INVENTORY}:${userId.toLowerCase()}`,
    ),
    ...Array.from(itemIds, (itemId) => `${Constants.redis.cache.economy.ITEM_EXISTS}:${itemId}`),
  ];

  for (const fill of fills) {
    if (!isGem(fill.itemId)) continue;

    keys.push(
      `${Constants.redis.cache.economy.HAS_GEM}:${fill.buyerId}:${fill.itemId}`.toLowerCase(),
    );
    if (fill.incomingItemDebit > 0) {
      keys.push(
        `${Constants.redis.cache.economy.HAS_GEM}:${fill.incomingUserId}:${fill.itemId}`.toLowerCase(),
      );
    }
  }

  if (keys.length > 0) {
    const uniqueKeys = [...new Set(keys)];

    await redis.del(...uniqueKeys);
    logger.debug("market: invalidated settlement caches", {
      fillOrderIds: fills.map((fill) => fill.restingOrderId),
      keyCount: uniqueKeys.length,
    });
  }
}

async function processMarketAutosell(fills: SettledMarketFill[], client: NypsiClient) {
  const acquisitions = new Map<string, { userId: string; itemId: string; amount: number }>();

  for (const fill of fills) {
    const key = `${fill.buyerId}:${fill.itemId}`;
    const acquisition = acquisitions.get(key);

    if (acquisition) acquisition.amount += fill.amount;
    else acquisitions.set(key, { userId: fill.buyerId, itemId: fill.itemId, amount: fill.amount });
  }

  for (const acquisition of acquisitions.values()) {
    await autosellInventoryItem(
      acquisition.userId,
      acquisition.itemId,
      acquisition.amount,
      client,
    ).catch((error) =>
      logger.error("market: failed to process autosell", { error, ...acquisition }),
    );
  }
}

function publishMarketSettlements(fills: SettledMarketFill[], client: NypsiClient) {
  for (const fill of fills) {
    if (fill.orderType === "buy") {
      addStat(fill.sellerId, "market-sold-items", fill.amount);
      addStat(fill.sellerId, "earned-market", Number(fill.sellerProceeds));
      addStat(fill.buyerId, "market-fulfilled-buy", fill.amount);
      addStat(fill.buyerId, "spent-market", Number(fill.gross));
    } else {
      addStat(fill.buyerId, "market-bought-items", fill.amount);
      addStat(fill.buyerId, "spent-market", Number(fill.gross));
      addStat(fill.sellerId, "market-fulfilled-sell", fill.amount);
      addStat(fill.sellerId, "earned-market", Number(fill.sellerProceeds));
    }

    publishMarketSettlementEffects(fill, client).catch((error) =>
      logger.error("market: failed to publish settlement effects", {
        error,
        orderId: fill.restingOrderId,
      }),
    );
  }
}

async function publishMarketSettlementEffects(fill: SettledMarketFill, client: NypsiClient) {
  transaction(fill.sellerId, fill.buyerId, "item", fill.amount, fill.itemId, "market");
  transaction(fill.buyerId, fill.sellerId, "money", fill.sellerProceeds, undefined, "market");

  const order = fill.order;
  const counterpartyId = order.ownerId === fill.buyerId ? fill.sellerId : fill.buyerId;

  if ((await getPreferences(order.ownerId)).dms.market) {
    let dmQueue = await redis
      .hget(`${Constants.redis.nypsi.MARKET_DM}:${order.orderType}`, order.ownerId)
      .then((result) => (result ? (JSON.parse(result) as DMQueue) : undefined));

    if (!dmQueue) {
      dmQueue = { userId: order.ownerId, createdAt: Date.now(), earned: 0, items: {} };
    }

    dmQueue.earned += Number(fill.sellerProceeds);

    if (!dmQueue.items[order.itemId]) dmQueue.items[order.itemId] = {};
    dmQueue.items[order.itemId][counterpartyId] =
      (dmQueue.items[order.itemId][counterpartyId] ?? 0) + fill.amount;

    await redis.hset(
      `${Constants.redis.nypsi.MARKET_DM}:${order.orderType}`,
      order.ownerId,
      JSON.stringify(dmQueue),
    );
  }

  if (!order.messageId) return;

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

async function marketSellUnlocked(
  member: MemberResolvable,
  itemId: string,
  amount: number,
  storedPrice: number,
  client: NypsiClient,
  orderId?: number,
): Promise<{ status: string; remaining: number }> {
  const userId = getUserId(member);

  if (!(await userExists(userId))) await createUser(userId);

  let order: Market;

  if (orderId) {
    order = await prisma.market.findUnique({
      where: { id: orderId },
    });

    if (!order || order.itemAmount < amount) {
      return { status: "too slow ):", remaining: -1 };
    }
  }

  // looking for buy orders
  const marketData = orderId
    ? quoteMarketOrder([order], { side: "sell", amount, ownerId: userId })
    : await getMarketTransactionData(itemId, amount, "buy", userId);
  const sellPrice = "cost" in marketData ? marketData.cost : Number(marketData.total);
  const fills = marketData.fills;

  if (orderId) {
    if (fills.length !== 1 || fills[0].order.completed || fills[0].order.itemAmount < amount) {
      return { status: "too slow ):", remaining: -1 };
    }
  }

  if (sellPrice == -1) {
    return { status: "not enough items", remaining: -1 };
  }

  if (storedPrice !== sellPrice) {
    return {
      status: `since viewing the market, the sell price has changed from $${storedPrice.toLocaleString()} to $${sellPrice.toLocaleString()}. please press sell again with this updated price in mind`,
      remaining: -1,
    };
  }

  const inventory = await getInventory(userId);

  if (inventory.count(itemId) < amount) {
    return {
      status: `you do not have this many ${getItems()[itemId].plural}`,
      remaining: -1,
    };
  }

  let settlement: { fills: SettledMarketFill[]; remainingAmount: number };

  try {
    settlement = await settleMarketFills({
      fills,
      incomingUserId: userId,
      requestedAmount: amount,
      incomingAssetsEscrowed: false,
    });
  } catch {
    return { status: "internal error", remaining: -1 };
  }

  await invalidateMarketSettlementCaches(settlement.fills);
  await processMarketAutosell(settlement.fills, client);
  publishMarketSettlements(settlement.fills, client);

  logger.info(
    `market: ${userId} (${await getLastKnownUsername(userId, false)}) sold ${amount} ${itemId}`,
  );

  if (settlement.remainingAmount) {
    return { status: "partial", remaining: settlement.remainingAmount };
  }

  return { status: "success", remaining: settlement.remainingAmount };
}

async function marketBuyUnlocked(
  member: MemberResolvable,
  itemId: string,
  amount: number,
  storedPrice: number,
  client: NypsiClient,
  orderId?: number,
): Promise<{ status: string; remaining: number }> {
  const userId = getUserId(member);

  if (!(await userExists(userId))) await createUser(userId);

  let order: Market;

  if (orderId) {
    order = await prisma.market.findUnique({
      where: { id: orderId },
    });

    if (!order || order.itemAmount < amount) {
      return { status: "too slow ):", remaining: -1 };
    }
  }

  // looking for sell orders
  const marketData = orderId
    ? quoteMarketOrder([order], { side: "buy", amount, ownerId: userId })
    : await getMarketTransactionData(itemId, amount, "sell", userId);
  const buyPrice = "cost" in marketData ? marketData.cost : Number(marketData.total);
  const fills = marketData.fills;

  if (orderId) {
    if (fills.length !== 1 || fills[0].order.completed || fills[0].order.itemAmount < amount) {
      return { status: "too slow ):", remaining: -1 };
    }
  }

  if (buyPrice == -1) {
    return { status: "not enough items", remaining: -1 };
  }

  if (storedPrice !== buyPrice) {
    return {
      status: `since viewing the market, the buy price has changed from $${storedPrice.toLocaleString()} to $${buyPrice.toLocaleString()}. please press buy again with this updated price in mind`,
      remaining: -1,
    };
  }

  if ((await getBalance(userId)) < buyPrice) {
    return { status: "insufficient funds", remaining: -1 };
  }

  let settlement: { fills: SettledMarketFill[]; remainingAmount: number };

  try {
    settlement = await settleMarketFills({
      fills,
      incomingUserId: userId,
      requestedAmount: amount,
      incomingAssetsEscrowed: false,
    });
  } catch {
    return { status: "internal error", remaining: -1 };
  }

  await invalidateMarketSettlementCaches(settlement.fills);
  await processMarketAutosell(settlement.fills, client);
  publishMarketSettlements(settlement.fills, client);

  logger.info(
    `market: ${userId} (${await getLastKnownUsername(userId, false)}) bought ${amount} ${itemId}`,
  );

  if (settlement.remainingAmount) {
    return { status: "partial", remaining: settlement.remainingAmount };
  }

  return { status: "success", remaining: settlement.remainingAmount };
}

export async function showMarketConfirmationModal(
  interaction: ButtonInteraction,
  action: OrderType,
  cost: number,
) {
  const id = `market-confirm-${Math.floor(Math.random() * 69420)}`;

  const modal = new ModalBuilder().setCustomId(id).setTitle("confirmation");

  modal.addLabelComponents(
    new LabelBuilder().setLabel("type 'yes' to confirm").setTextInputComponent(
      new TextInputBuilder()
        .setCustomId("confirmation")
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

  if (res.fields.getTextInputValue("confirmation").toLowerCase() !== "yes") {
    res.reply({
      embeds: [new CustomEmbed().setDescription("✅ cancelled purchase")],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  res.deferUpdate();

  return true;
}
