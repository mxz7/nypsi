import dayjs = require("dayjs");
import prisma from "../../init/database";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import { deleteMarketOrder } from "../../utils/functions/economy/market";
import { getItems, userExists } from "../../utils/functions/economy/utils";
import { pluralize } from "../../utils/functions/string";
import { addMarketNotification } from "../../utils/functions/users/market-notifications";

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
      if (!(await deleteMarketOrder(order.id, manager))) continue;

      if (!(await userExists(order.ownerId))) continue;

      const embed = new CustomEmbed(order.ownerId);

      embed.setDescription(
        `your buy order for ${order.itemAmount}x ${items[order.itemId].emoji} ${
          items[order.itemId].name
        } has expired. you have been given back your money`,
      );

      await addMarketNotification({
        memberId: order.ownerId,
        payload: {
          content: "your buy order has expired",
          embed: embed,
        },
      });
    }

    for (const order of sellOrders) {
      if (!(await deleteMarketOrder(order.id, manager))) continue;

      if (!(await userExists(order.ownerId))) continue;

      const embed = new CustomEmbed(order.ownerId);

      embed.setDescription(
        `your sell order for ${order.itemAmount}x ${items[order.itemId].emoji} ${
          items[order.itemId].name
        } has expired. you have been given back your ${pluralize("item", order.itemAmount)}`,
      );

      await addMarketNotification({
        memberId: order.ownerId,
        payload: {
          content: "your sell order has expired",
          embed: embed,
        },
      });
    }

    if (sellOrders.length > 0) {
      log(`${sellOrders.length} sell orders expired`);
    }

    limit = dayjs().subtract(2, "year").toDate();

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
