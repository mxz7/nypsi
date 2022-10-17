import dayjs = require("dayjs");
import ms = require("ms");
import prisma from "../../init/database";
import { deleteAuction } from "../../utils/functions/economy/auctions";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { getItems, userExists } from "../../utils/functions/economy/utils";
import requestDM from "../../utils/functions/requestdm";
import { getDmSettings } from "../../utils/functions/users/notifications";
import { logger } from "../../utils/logger";
import { NypsiClient } from "../../utils/models/Client";
import { CustomEmbed } from "../../utils/models/EmbedBuilders";

export async function runAuctionChecks(client: NypsiClient) {
  setInterval(async () => {
    let limit = dayjs().subtract(2, "days").toDate();

    const query = await prisma.auction.findMany({
      where: {
        AND: [{ createdAt: { lte: limit } }, { sold: false }],
      },
      select: {
        ownerId: true,
        itemAmount: true,
        itemName: true,
        id: true,
      },
    });

    const items = getItems();

    for (const auction of query) {
      await deleteAuction(auction.id, client);

      if (!(await userExists(auction.ownerId))) continue;

      await addInventoryItem(auction.ownerId, auction.itemName, auction.itemAmount, false);

      const embed = new CustomEmbed().setColor("#36393f");

      embed.setDescription(
        `your auction for ${auction.itemAmount}x ${items[auction.itemName].emoji} ${
          items[auction.itemName].name
        } has expired. you have been given back your item${auction.itemAmount > 1 ? "s" : ""}`
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

    limit = dayjs().subtract(90, "days").toDate();

    const { count } = await prisma.auction.deleteMany({
      where: {
        AND: [{ sold: true }, { createdAt: { lte: limit } }],
      },
    });

    if (count > 0) {
      logger.info(`${count.toLocaleString()} sold auctions deleted`);
    }
  }, ms("3 hours"));
}
