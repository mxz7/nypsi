import dayjs = require("dayjs");
import ms = require("ms");
import prisma from "../../init/database";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import { addBalance } from "../../utils/functions/economy/balance";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { deleteMarketOrder } from "../../utils/functions/economy/market";
import { getItems, userExists } from "../../utils/functions/economy/utils";
import { addNotificationToQueue, getDmSettings } from "../../utils/functions/users/notifications";

export default {
  name: "checkmarket",
  cron: "0 */7 * * *",
  async run(log, manager) {
    let limit = dayjs().subtract(14, "days").toDate();

    const items = getItems();

    const buyOrders = await prisma.market.findMany({
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

    const sellOrders = await prisma.market.findMany({
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
      await deleteMarketOrder(order.id, manager);

      if (!(await userExists(order.ownerId))) continue;

      await addBalance(order.ownerId, Number(order.price * order.itemAmount));

      const embed = new CustomEmbed(order.ownerId);

      embed.setDescription(
        `your buy order for ${order.itemAmount}x ${items[order.itemId].emoji} ${
          items[order.itemId].name
        } has expired. you have been given back your money`,
      );

      if ((await getDmSettings(order.ownerId)).market) {
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
      await deleteMarketOrder(order.id, manager);

      if (!(await userExists(order.ownerId))) continue;

      await addInventoryItem(order.ownerId, order.itemId, Number(order.itemAmount));

      const embed = new CustomEmbed(order.ownerId);

      embed.setDescription(
        `your sell order for ${order.itemAmount}x ${items[order.itemId].emoji} ${
          items[order.itemId].name
        } has expired. you have been given back your item${order.itemAmount > 1 ? "s" : ""}`,
      );

      if ((await getDmSettings(order.ownerId)).market) {
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
      log(`${sellOrders.length} sell orders expired`);
    }

    limit = dayjs().subtract(180, "days").toDate();

    const { count: deletedCompletedOrders } = await prisma.market.deleteMany({
      where: {
        AND: [{ completed: true }, { createdAt: { lte: limit } }],
      },
    });

    if (deletedCompletedOrders > 0) {
      log(`${deletedCompletedOrders.toLocaleString()} completed market orders deleted`);
    }

    const { count: deletedSoldOffers } = await prisma.offer.deleteMany({
      where: {
        AND: [{ sold: true }, { soldAt: { lte: limit } }],
      },
    });

    if (deletedSoldOffers > 0) {
      log(`${deletedSoldOffers.toLocaleString()} sold offers deleted`);
    }
  },
} satisfies Job;
