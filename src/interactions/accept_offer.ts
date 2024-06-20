import { EmbedBuilder } from "discord.js";
import prisma from "../init/database";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import Constants from "../utils/Constants";
import { addBalance } from "../utils/functions/economy/balance";
import {
  addInventoryItem,
  getInventory,
  setInventoryItem,
} from "../utils/functions/economy/inventory";
import { checkOffer } from "../utils/functions/economy/offers";
import { addStat } from "../utils/functions/economy/stats";
import { getItems, isEcoBanned } from "../utils/functions/economy/utils";
import { isPremium } from "../utils/functions/premium/premium";
import { addToNypsiBank, getTax } from "../utils/functions/tax";
import { addNotificationToQueue, getDmSettings } from "../utils/functions/users/notifications";
import { transaction } from "../utils/logger";

export default {
  name: "accept-offer",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;
    if ((await isEcoBanned(interaction.user.id)).banned) return;

    if (await redis.exists(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`)) {
      return interaction.reply({
        embeds: [
          new CustomEmbed(null, "please wait until your offer has been processed").setColor(
            Constants.TRANSPARENT_EMBED_COLOR,
          ),
        ],
        ephemeral: true,
      });
    }

    await redis.set(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`, "t");
    await redis.expire(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`, 69);

    const offer = await prisma.offer.findFirst({
      where: {
        AND: [{ messageId: interaction.message.id }, { sold: false }],
      },
    });

    if (!offer) {
      return await redis.del(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`);
    }

    if ((await isEcoBanned(offer.ownerId)).banned) {
      await prisma.offer.delete({
        where: {
          messageId: offer.messageId,
        },
      });
      await redis.del(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`);
      return interaction.reply({ embeds: [new ErrorEmbed("they are banned.")] });
    }

    const inventory = await getInventory(interaction.user.id);

    if (
      !inventory.find((i) => i.item === offer.itemId) ||
      inventory.find((i) => i.item === offer.itemId).amount < offer.itemAmount
    ) {
      await redis.del(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`);
      return interaction.reply({
        embeds: [new ErrorEmbed("you don't have the items for this offer")],
      });
    }
    if (Number(offer.money / offer.itemAmount) < 50_000) {
      await prisma.offer.delete({
        where: {
          messageId: offer.messageId,
        },
      });
    } else {
      await prisma.offer.update({
        where: {
          messageId: offer.messageId,
        },
        data: {
          sold: true,
          soldAt: new Date(),
        },
      });
    }

    await setInventoryItem(
      interaction.user.id,
      offer.itemId,
      inventory.find((i) => i.item === offer.itemId).amount - Number(offer.itemAmount),
    );

    const tax = await getTax();
    let taxedAmount = 0;

    if (!(await isPremium(offer.ownerId)) && Number(offer.money) > 1_000_000)
      taxedAmount = Math.floor(Number(offer.money) * tax);

    await Promise.all([
      await addToNypsiBank(taxedAmount),
      addBalance(interaction.user.id, Number(offer.money) - taxedAmount),
      addInventoryItem(offer.ownerId, offer.itemId, Number(offer.itemAmount)),
      addStat(interaction.user.id, "earned-offers", Math.floor(Number(offer.money)) - taxedAmount),
      addStat(offer.ownerId, "spent-offers", Math.floor(Number(offer.money)) - taxedAmount),
    ]);

    const embed = new EmbedBuilder(interaction.message.embeds[0]);

    embed.setDescription((embed.data.description.split("\n")[0] += "\n\n**offer accepted**"));
    embed.setColor(Constants.EMBED_SUCCESS_COLOR);

    await interaction.message.edit({ embeds: [embed], components: [] });

    if ((await getDmSettings(offer.ownerId)).auction) {
      await addNotificationToQueue({
        memberId: offer.ownerId,
        payload: {
          content: `your offer to ${interaction.user.username} for ${offer.itemAmount}x ${
            getItems()[offer.itemId].name
          } has been accepted`,
          embed: new CustomEmbed(
            null,
            `you paid $${offer.money.toLocaleString()} for **${offer.itemAmount.toLocaleString()}x** ${
              getItems()[offer.itemId].emoji
            } **${getItems()[offer.itemId].name}**`,
          ).setColor(Constants.EMBED_SUCCESS_COLOR),
        },
      });
    }

    for (const testOffer of await prisma.offer.findMany({
      where: {
        AND: [{ targetId: interaction.user.id }, { itemId: offer.itemId }, { sold: false }],
      },
    })) {
      await checkOffer(testOffer, interaction.client as NypsiClient);
    }

    await redis.del(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`);

    transaction(
      interaction.user,
      await interaction.client.users.fetch(offer.ownerId),
      `${offer.itemAmount}x ${offer.itemId} (offer)`,
    );
    transaction(
      await interaction.client.users.fetch(offer.ownerId),
      interaction.user,
      `$${offer.money.toLocaleString()} (offer)`,
    );
  },
} as InteractionHandler;
