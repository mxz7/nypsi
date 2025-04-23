import dayjs = require("dayjs");
import ms = require("ms");
import prisma from "../../init/database";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { getItems, userExists } from "../../utils/functions/economy/utils";
import { addNotificationToQueue, getDmSettings } from "../../utils/functions/users/notifications";
import { logger } from "../../utils/logger";
import { addBalance } from "../../utils/functions/economy/balance";
import { deleteMarketOrder } from "../../utils/functions/economy/market";

export async function runMarketChecks(client: NypsiClient) {
  setInterval(async () => {
    let limit = dayjs().subtract(14, "days").toDate();

    const items = getItems();

    const buyOrders = await prisma.marketOrder.findMany({
      where: {
        AND: [{ createdAt: { lte: limit } }, { completed: false }, { orderType: "buy" }],
      },
      select: {
        ownerId: true,
        itemAmount: true,
        itemId: true,
        price: true,
        id: true,
      },
    });

    const sellOrders = await prisma.marketOrder.findMany({
      where: {
        AND: [{ createdAt: { lte: limit } }, { completed: false }, { orderType: "sell" }],
      },
      select: {
        ownerId: true,
        itemAmount: true,
        itemId: true,
        id: true,
      },
    });

    for (const order of buyOrders) {
      await deleteMarketOrder(order.id, client);

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
      await deleteMarketOrder(order.id, client);

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

    const { count: deletedCompletedOrders } = await prisma.marketOrder.deleteMany({
      where: {
        AND: [{ completed: true }, { createdAt: { lte: limit } }],
      },
    });

    if (deletedCompletedOrders > 0) {
      logger.info(`${deletedCompletedOrders.toLocaleString()} completed market orders deleted`);
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
