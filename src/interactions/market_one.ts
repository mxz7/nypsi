import { Market } from "@prisma/client";
import { MessageFlags } from "discord.js";
import prisma from "../init/database";
import { NypsiClient } from "../models/Client";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import {
  marketBuy,
  marketSell,
  showMarketConfirmationModal,
} from "../utils/functions/economy/market";
import { isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { getPreferences } from "../utils/functions/users/notifications";

export default {
  name: "market-one",
  type: "interaction",
  async run(interaction) {
    const doChecks = async (order: Market) => {
      if (order.ownerId == interaction.user.id) {
        await interaction.reply({
          embeds: [new ErrorEmbed("you cannot fulfill your own order")],
          ephemeral: true,
        });
        return false;
      }

      if (!order || !(await userExists(order.ownerId))) {
        await interaction.reply({ embeds: [new ErrorEmbed("invalid order")], ephemeral: true });
        await interaction.message.delete();
        return false;
      }

      if (order.completed || order.itemAmount <= 0n) {
        await interaction.reply({
          embeds: [new ErrorEmbed("too slow ):")],
          flags: MessageFlags.Ephemeral,
        });
        return false;
      }

      return true;
    };

    if (!interaction.isButton()) return;
    if ((await isEcoBanned(interaction.user.id)).banned) return;
    let order = await prisma.market.findUnique({
      where: {
        messageId: interaction.message.id,
      },
    });

    let res = await doChecks(order);

    if (!res) return;

    if ((await getPreferences(interaction.user.id)).marketConfirm > order.price) {
      const res = await showMarketConfirmationModal(interaction, order.price);

      if (!res) return;
    } else {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    order = await prisma.market.findUnique({
      where: {
        messageId: interaction.message.id,
      },
    });

    res = await doChecks(order);

    if (!res) return;

    const orderResponse =
      order.orderType == "buy"
        ? await marketSell(
            interaction.user.id,
            order.itemId,
            1,
            Number(order.price),
            interaction.client as NypsiClient,
            order.id,
          )
        : await marketBuy(
            interaction.user.id,
            order.itemId,
            1,
            Number(order.price),
            interaction.client as NypsiClient,
            order.id,
          );

    if (orderResponse && orderResponse.status !== "success" && orderResponse.status !== "partial") {
      return await interaction.followUp({
        embeds: [new ErrorEmbed(orderResponse.status)],
        ephemeral: true,
      });
    } else return interaction.deferUpdate();
  },
} as InteractionHandler;
