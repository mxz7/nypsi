import dayjs = require("dayjs");
import ms = require("ms");
import prisma from "../../database/database";
import { deleteAuction, getInventory, getItems, setInventory, userExists } from "../../economy/utils";
import requestDM from "../../functions/requestdm";
import { logger } from "../../logger";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";

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

      const inventory = await getInventory(auction.ownerId);

      if (inventory[auction.itemName]) {
        inventory[auction.itemName] += auction.itemAmount;
      } else {
        inventory[auction.itemName] = auction.itemAmount;
      }

      await setInventory(auction.ownerId, inventory);

      const embed = new CustomEmbed().setColor("#36393f");

      embed.setDescription(
        `your auction for ${auction.itemAmount}x ${items[auction.itemName].emoji} ${
          items[auction.itemName].name
        } has expired. you have been given back your item${auction.itemAmount > 1 ? "s" : ""}`
      );

      await requestDM({
        client: client,
        content: "your auction has expired",
        memberId: auction.ownerId,
        embed: embed,
      });
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
