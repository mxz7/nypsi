import dayjs = require("dayjs");
import ms = require("ms");
import prisma from "../../init/database";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../../utils/Constants";
import { deleteAuction } from "../../utils/functions/economy/auctions";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { getItems, userExists } from "../../utils/functions/economy/utils";
import requestDM from "../../utils/functions/requestdm";
import { getDmSettings } from "../../utils/functions/users/notifications";
import { logger } from "../../utils/logger";

export async function runAuctionChecks(client: NypsiClient) {
  setInterval(async () => {
    let limit = dayjs().subtract(14, "days").toDate();

    const query = await prisma.auction.findMany({
      where: {
        AND: [{ createdAt: { lte: limit } }, { sold: false }],
      },
      select: {
        ownerId: true,
        itemAmount: true,
        itemId: true,
        id: true,
      },
    });

    const items = getItems();

    for (const auction of query) {
      await deleteAuction(auction.id, client);

      if (!(await userExists(auction.ownerId))) continue;

      await addInventoryItem(auction.ownerId, auction.itemId, Number(auction.itemAmount));

      const embed = new CustomEmbed().setColor(Constants.TRANSPARENT_EMBED_COLOR);

      embed.setDescription(
        `your auction for ${auction.itemAmount}x ${items[auction.itemId].emoji} ${
          items[auction.itemId].name
        } has expired. you have been given back your item${auction.itemAmount > 1 ? "s" : ""}`,
      );

      if ((await getDmSettings(auction.ownerId)).auction) {
        await requestDM({
          client: client,
          content: "your auction has expired",
          memberId: auction.ownerId,
          embed: embed,
        });
      }
    }

    if (query.length > 0) {
      logger.info(`${query.length} auctions expired`);
    }

    limit = dayjs().subtract(180, "days").toDate();

    const { count: deletedSoldAuctions } = await prisma.auction.deleteMany({
      where: {
        AND: [{ sold: true }, { createdAt: { lte: limit } }],
      },
    });

    if (deletedSoldAuctions > 0) {
      logger.info(`${deletedSoldAuctions.toLocaleString()} sold auctions deleted`);
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
