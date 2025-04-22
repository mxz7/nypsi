import dayjs = require("dayjs");
import ms = require("ms");
import prisma from "../../init/database";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { deleteMarketBuyOrder, deleteMarketSellOrder } from "../../utils/functions/economy/market";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { getItems, userExists } from "../../utils/functions/economy/utils";
import { addNotificationToQueue, getDmSettings } from "../../utils/functions/users/notifications";
import { logger } from "../../utils/logger";
import { addBalance } from "../../utils/functions/economy/balance";

export async function runMarketChecks(client: NypsiClient) {
  setInterval(async () => {
    let limit = dayjs().subtract(14, "days").toDate();

    const items = getItems();

    const buyOrders = await prisma.marketBuyOrder.findMany({
      where: {
        AND: [{ createdAt: { lte: limit } }, { completed: false }],
      },
      select: {
        ownerId: true,
        itemAmount: true,
        itemId: true,
        price: true,
        id: true,
      },
    });

    const sellOrders = await prisma.marketSellOrder.findMany({
      where: {
        AND: [{ createdAt: { lte: limit } }, { completed: false }],
      },
      select: {
        ownerId: true,
        itemAmount: true,
        itemId: true,
        id: true,
      },
    });

    for (const order of buyOrders) {
      await deleteMarketBuyOrder(order.id, client);

      if (!(await userExists(order.ownerId))) continue;

      await addBalance(order.ownerId, Number(order.price * order.itemAmount))

      const embed = new CustomEmbed(order.ownerId);

      embed.setDescription(
        `your buy order for ${order.itemAmount}x ${items[order.itemId].emoji} ${
          items[order.itemId].name
        } has expired. you have been given back your money`,
      );

      if ((await getDmSettings(order.ownerId)).auction) {
        addNotificationToQueue({
          memberId: order.ownerId,
          payload: {
            content: "your buy order has expired",
            embed: embed,
          },
        });
      }
    }

    for (const order of sellOrders) {
      await deleteMarketSellOrder(order.id, client);

      if (!(await userExists(order.ownerId))) continue;

      await addInventoryItem(order.ownerId, order.itemId, Number(order.itemAmount));

      const embed = new CustomEmbed(order.ownerId);

      embed.setDescription(
        `your sell order for ${order.itemAmount}x ${items[order.itemId].emoji} ${
          items[order.itemId].name
        } has expired. you have been given back your item${order.itemAmount > 1 ? "s" : ""}`,
      );

      if ((await getDmSettings(order.ownerId)).auction) {
        addNotificationToQueue({
          memberId: order.ownerId,
          payload: {
            content: "your sell order has expired",
            embed: embed,
          },
        });
      }
    }

    if (sellOrders.length > 0) {
      logger.info(`${sellOrders.length} sell orders expired`);
    }

    limit = dayjs().subtract(180, "days").toDate();

    const { count: deletedCompletedSellOrders } = await prisma.marketSellOrder.deleteMany({
      where: {
        AND: [{ completed: true }, { createdAt: { lte: limit } }],
      },
    });

    if (deletedCompletedSellOrders > 0) {
      logger.info(`${deletedCompletedSellOrders.toLocaleString()} completed sell orders deleted`);
    }
    
    const { count: deletedCompletedBuyOrders } = await prisma.marketBuyOrder.deleteMany({
      where: {
        AND: [{ completed: true }, { createdAt: { lte: limit } }],
      },
    });

    if (deletedCompletedBuyOrders > 0) {
      logger.info(`${deletedCompletedBuyOrders.toLocaleString()} completed buy orders deleted`);
    }

    const { count: deletedSoldOffers } = await prisma.offer.deleteMany({
      where: {
        AND: [{ sold: true }, { soldAt: { lte: limit } }],
      },
    });

    if (deletedSoldOffers > 0) {
      logger.info(`${deletedSoldOffers.toLocaleString()} sold offers deleted`);
    }
  }, ms("3 hours"));
}
