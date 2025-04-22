import { MarketWatch } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonInteraction,
  GuildMember,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
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
import itemHistoryWorker from "../workers/itemhistory";
import { addBalance, getBalance, removeBalance } from "./balance";
import { addInventoryItem } from "./inventory";
import { addStat } from "./stats";
import { createUser, getItems, userExists } from "./utils";
import ms = require("ms");
import dayjs = require("dayjs");
import { Item } from "../../../types/Economy";
import { NypsiMessage } from "../../../models/Command";

const beingBought = new Set<String>();
const dmQueue = new Map<string, { buyers: Map<string, number> }>();

export async function getMarketBuyOrders(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.marketBuyOrder.findMany({
    where: {
      AND: [{ ownerId: id }, { completed: false }],
    },
    orderBy: { createdAt: "asc" },
  });

  return query;
}

export async function getMarketSellOrders(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.marketSellOrder.findMany({
    where: {
      AND: [{ ownerId: id }, { completed: false }],
    },
    orderBy: { createdAt: "asc" },
  });

  return query;
}

export async function getMarketItemBuyOrders(itemId: string, filterOutUserId?: string) {
  const query = await prisma.marketBuyOrder.findMany({
    where: {
      AND: [{ itemId: itemId }, { completed: false }],
    },
    orderBy: [{ price: "desc" }, { createdAt: "asc" }],
  });

  if (filterOutUserId) return query.filter((m) => m.ownerId !== filterOutUserId);
  return query;
}

export async function getMarketItemSellOrders(itemId: string, filterOutUserId?: string) {
  const query = await prisma.marketSellOrder.findMany({
    where: {
      AND: [{ itemId: itemId }, { completed: false }],
    },
    orderBy: [{ price: "asc" }, { createdAt: "asc" }],
  });

  if (filterOutUserId) return query.filter((m) => m.ownerId !== filterOutUserId);
  return query;
}

export async function getMarketAverage(item: string) {
  if (await redis.exists(`${Constants.redis.cache.economy.MARKET_AVG}:${item}`))
    return parseInt(await redis.get(`${Constants.redis.cache.economy.MARKET_AVG}:${item}`));

  const buyOrders = await prisma.marketBuyOrder.findMany({
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
  
  const sellOrders = await prisma.marketSellOrder.findMany({
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

  for (const order of buyOrders) {
    if (costs.length >= 500) break;

    costs.push(Number(order.price));
  }

  for (const order of sellOrders) {
    if (costs.length >= 500) break;

    costs.push(Number(order.price));
  }

  let filtered = filterOutliers(costs);

  if (!filtered) {
    logger.warn("failed to filter outliers (market)", { costs, item, buyOrders, sellOrders });
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

export async function updateMarketWatch(member: GuildMember, itemName: string, itemCost?: number) {
  await prisma.marketWatch.upsert({
    where: {
      userId_itemId: {
        userId: member.user.id,
        itemId: itemName,
      },
    },
    update: {
      itemId: itemName,
      maxCost: itemCost,
    },
    create: {
      userId: member.user.id,
      itemId: itemName,
      maxCost: itemCost,
    },
  });

  return getMarketWatch(member);
}

export async function setMarketWatch(member: GuildMember, items: MarketWatch[]) {
  await prisma.marketWatch.deleteMany({ where: { userId: member.user.id } });

  await prisma.marketWatch.createMany({ data: items });
  return items;
}

export async function deleteMarketWatch(member: GuildMember, itemId: string) {
  await prisma.marketWatch.delete({
    where: {
      userId_itemId: {
        userId: member.user.id,
        itemId: itemId,
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

async function checkWatchers(
  itemName: string,
  messageUrl: string,
  creatorId: string,
  cost: number,
) {
  const users = await prisma.marketWatch
    .findMany({
      where: {
        AND: [
          { itemId: itemName },
          { userId: { not: creatorId } },
          { OR: [{ maxCost: { gte: Math.floor(cost) } }, { maxCost: 0 }] },
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
        `a sell order has been for ${getItems()[itemName].emoji} **[${
          getItems()[itemName].name
        }](https://nypsi.xyz/item/${itemName})**`,
      ),
    },
    memberId: "boob",
  };

  for (const userId of users) {
    if (!(await getDmSettings(userId)).auction) continue;

    if (await redis.exists(`${Constants.redis.cooldown.MARKET_WATCH}:${userId}`)) continue;

    payload.memberId = userId;
    payload.payload.embed.setColor(getColor(userId));

    addNotificationToQueue(payload);

    await redis.set(`${Constants.redis.cooldown.MARKET_WATCH}:${userId}`, "true", "EX", 300);
  }
}

export async function countItemOnMarket(itemId: string) {
  const amount = await prisma.marketSellOrder.aggregate({
    where: {
      AND: [{ completed: false }, { itemId: itemId }],
    },
    _sum: {
      itemAmount: true,
    },
  });

  return amount?._sum?.itemAmount || 0;
}

export async function deleteMarketBuyOrder(id: number, client: NypsiClient, repeatCount = 1) {
  
  const buyOrder = await prisma.marketBuyOrder
    .findFirst({
      where: {
        AND: [{ id: id }, { completed: false }],
      },
    })
    .catch(() => {});

  if (!buyOrder) return false;

  if (
    beingBought.has(buyOrder.itemId) ||
    (await redis.exists(`${Constants.redis.nypsi.MARKET_SELLING}:${id}`))
  ) {
    return new Promise((resolve) => {
      logger.debug(`repeating buy order delete - ${id}`);
      setTimeout(async () => {
        if (repeatCount > 100) {
          beingBought.delete(buyOrder.itemId);
          await redis.del(`${Constants.redis.nypsi.MARKET_SELLING}:${id}`);
        }
        resolve(deleteMarketBuyOrder(id, client, repeatCount + 1));
      }, 1000);
    });
  }

  await prisma.marketBuyOrder.delete({
    where: {
      id: id,
    }
  });

  return Boolean(buyOrder);
}

export async function deleteMarketSellOrder(id: number, client: NypsiClient, repeatCount = 1) {
  
  const sellOrder = await prisma.marketSellOrder
    .findFirst({
      where: {
        AND: [{ id: id }, { completed: false }],
      },
    })
    .catch(() => {});

  if (!sellOrder) return false;

  if (
    beingBought.has(sellOrder.itemId) ||
    (await redis.exists(`${Constants.redis.nypsi.MARKET_BUYING}:${id}`))
  ) {
    return new Promise((resolve) => {
      logger.debug(`repeating sell order delete - ${id}`);
      setTimeout(async () => {
        if (repeatCount > 100) {
          beingBought.delete(sellOrder.itemId);
          await redis.del(`${Constants.redis.nypsi.MARKET_BUYING}:${id}`);
        }
        resolve(deleteMarketSellOrder(id, client, repeatCount + 1));
      }, 1000);
    });
  }

  await prisma.marketSellOrder.delete({
    where: {
      id: id,
    }
  });

  return Boolean(sellOrder);
}

async function showMarketConfirmation(interaction: ButtonInteraction, cost: number) {
  const id = `market-confirm-${Math.floor(Math.random() * 69420)}`;

  const modal = new ModalBuilder().setCustomId(id).setTitle("confirmation");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("confirmation")
        .setLabel("type 'yes' to confirm")
        .setPlaceholder(`this will cost $${cost.toLocaleString()}`)
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

  if (res.fields.fields.first().value.toLowerCase() != "yes") {
    res.reply({
      embeds: [new CustomEmbed().setDescription("✅ cancelled purchase")],
      ephemeral: true,
    });
    return false;
  }
  res.reply({ embeds: [new CustomEmbed(null, "✅ confirmation accepted")], ephemeral: true });

  return true;
}


export async function getPriceForMarketBuy(itemId: string, amount: number, filterOutUserId: string) {
  const sellOrders = await getMarketItemSellOrders(itemId, filterOutUserId);

  let cost = 0;

  for (const order of sellOrders) {
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

export async function marketBuy(
  item: Item,
  amount: number,
  storedPrice: number,
  member: GuildMember,
  repeatCount = 1,
) {
  if (beingBought.has(item.id)) {
    return new Promise((resolve) => {
      logger.debug(
        `repeating market buy - ${amount}x ${item.id}`,
      );
      setTimeout(async () => {
        if (repeatCount > 100) beingBought.delete(item.id);
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

  beingBought.add(item.id);
  await redis.set(`${Constants.redis.nypsi.MARKET_BUYING}:${item.id}`, "d", "EX", 600);

  if (!(await userExists(member.id))) await createUser(member.id);

  const buyPrice = await getPriceForMarketBuy(item.id, amount, member.id);

  if (buyPrice == -1) {
    await redis.del(`${Constants.redis.nypsi.MARKET_BUYING}:${item.id}`);
    beingBought.delete(item.id);
    return "not enough items"
  }

  if (storedPrice !== buyPrice) {
    await redis.del(`${Constants.redis.nypsi.MARKET_BUYING}:${item.id}`);
    beingBought.delete(item.id);
    return `since viewing the market, the price has changed from $${storedPrice.toLocaleString()} to $${buyPrice.toLocaleString()}. please press purchase again with this updated price in mind`;
  }

  console.log({buyPrice, balance: await getBalance(member)});

  if (await getBalance(member) < buyPrice) {
    await redis.del(`${Constants.redis.nypsi.MARKET_BUYING}:${item.id}`);
    beingBought.delete(item.id);
    return "you cannot afford this";
  }

  setTimeout(() => {
    beingBought.delete(item.id);
  }, ms("10 minutes"));

  const sellOrders = await getMarketItemSellOrders(item.id, member.id);

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

  console.log({sellOrders, usedOrders})

  if (total > 0) {
    await redis.del(`${Constants.redis.nypsi.MARKET_BUYING}:${item.id}`);
    beingBought.delete(item.id);
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
      await prisma.marketSellOrder.delete({
        where: {
          id: order.id,
        },
      });
    } else if (order.itemAmount > order.buyAmount) {
      await prisma.marketSellOrder.create({
        data: {
          completed: true,
          itemId: item.id,
          itemAmount: order.buyAmount,
          price: order.price,
          ownerId: order.ownerId,
        },
      });

      await prisma.marketSellOrder
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
      await prisma.marketSellOrder
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
      `${item.id} x ${order.buyAmount} (market buy)`,
    );
    transaction(
      member.user,
      await member.client.users.fetch(order.ownerId),
      `$${(order.buyAmount * order.price - taxedAmount).toLocaleString()} (market buy)`,
    );

    if ((await getDmSettings(order.ownerId)).auction) {
      if (dmQueue.has(`${order.ownerId}-${item.id}`)) {
        if (
          dmQueue.get(`${order.ownerId}-${item.id}`).buyers.has(member.id)
        ) {
          dmQueue
            .get(`${order.ownerId}-${item.id}`)
            .buyers.set(
              member.user.username,
              dmQueue
                .get(`${order.ownerId}-${item.id}`)
                .buyers.get(member.user.username) + Number(amount),
            );
        } else {
          dmQueue
            .get(`${order.ownerId}-${item.id}`)
            .buyers.set(member.user.username, Number(amount));
        }
      } else {
        dmQueue.set(`${order.ownerId}-${item.id}`, {
          buyers: new Map([[member.user.username, Number(amount)]]),
        });

        setTimeout(async () => {
          if (!dmQueue.has(`${order.ownerId}-${item.id}`)) return;
          const buyers = dmQueue.get(`${order.ownerId}-${item.id}`).buyers;
          const total = Array.from(buyers.values()).reduce((a, b) => a + b);
          const moneyReceived = Math.floor(order.buyAmount * order.price);

          const embedDm = new CustomEmbed(order.ownerId)
            .setDescription(
              `${total.toLocaleString()}x of your ${items[item.id].emoji} ${
                items[item.id].name
              } sell order(s) has been bought by: \n${Array.from(buyers.entries())
                .map((i) => `**${i[0]}**: ${i[1]}`)
                .join("\n")}`,
            )
            .setFooter({ text: `+$${(moneyReceived - taxedAmount).toLocaleString()}` });
          dmQueue.delete(`${order.ownerId}-${item.id}`);

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
  
  if (totalTax > 0) addToNypsiBank(totalTax);

  await Promise.all([
    addInventoryItem(member, item.id, Number(amount)),
    removeBalance(member, buyPrice),
    addStat(member, "spent-market", buyPrice - totalTax),
  ]);

  logger.info(
    `market item purchased ${amount} ${item.id}`, { usedOrders: usedOrders  }
  );
  
  await redis.del(`${Constants.redis.nypsi.MARKET_BUYING}:${item.id}`);
  beingBought.delete(item.id);

  return "success";
}

export async function getItemHistoryGraph(itemId: string) {
  if (await redis.exists(`${Constants.redis.cache.economy.MARKET_ITEM_GRAPH_DATA}:${itemId}`)) {
    return await redis.get(`${Constants.redis.cache.economy.MARKET_ITEM_GRAPH_DATA}:${itemId}`);
  }

  const res = await itemHistoryWorker(itemId);

  if (typeof res === "string") {
    await redis.set(
      `${Constants.redis.cache.economy.MARKET_ITEM_GRAPH_DATA}:${itemId}`,
      res,
      "EX",
      ms("1 day") / 1000,
    );
  }

  return res;
}
