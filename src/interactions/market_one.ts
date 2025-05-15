import { Market } from "@prisma/client";
import { MessageFlags } from "discord.js";
import prisma from "../init/database";
import { NypsiClient } from "../models/Client";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import { calcItemValue } from "../utils/functions/economy/inventory";
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
      if (!order || !(await userExists(order.ownerId))) {
        const embed = new ErrorEmbed("invalid order");

        await interaction
          .reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
          })
          .catch(() =>
            interaction
              .followUp({ embeds: [embed], flags: MessageFlags.Ephemeral })
              .catch(() => {}),
          );

        await interaction.message.delete();
        return false;
      }

      if (order.ownerId === interaction.user.id) {
        const embed = new ErrorEmbed("you cannot fulfill your own order. idiot.");

        await interaction
          .reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
          })
          .catch(() =>
            interaction
              .followUp({ embeds: [embed], flags: MessageFlags.Ephemeral })
              .catch(() => {}),
          );
        return false;
      }

      if (order.completed || order.itemAmount <= 0n) {
        const embed = new ErrorEmbed("too slow ):");
        await interaction
          .reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
          })
          .catch(() =>
            interaction
              .followUp({ embeds: [embed], flags: MessageFlags.Ephemeral })
              .catch(() => {}),
          );
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

    let value = Number(order.price);

    if (order.orderType === "buy") {
      value = await calcItemValue(order.itemId);
    }

    if ((await getPreferences(interaction.user.id)).marketConfirm < value) {
      const res = await showMarketConfirmationModal(interaction, value);

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
