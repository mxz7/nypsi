import { Market } from "@prisma/client";
import { MessageFlags } from "discord.js";
import prisma from "../init/database";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import { getBalance } from "../utils/functions/economy/balance";
import { getInventory } from "../utils/functions/economy/inventory";
import {
  marketBuy,
  marketSell,
  showMarketConfirmationModal,
} from "../utils/functions/economy/market";
import { getItems, isEcoBanned, userExists } from "../utils/functions/economy/utils";
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

      if (order.orderType === "sell") {
        const balance = await getBalance(interaction.user.id);

        if (balance < Number(order.price)) {
          const embed = new ErrorEmbed("you can't afford this");
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
      } else {
        const inventory = await getInventory(interaction.user.id);

        if ((inventory.find((i) => i.item)?.amount || 0) < 1) {
          const embed = new ErrorEmbed("you don't have enough of this item");
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
      }

      return true;
    };

    if (!interaction.isButton()) return;
    if ((await isEcoBanned(interaction.user.id)).banned) return;
    if (await redis.exists("nypsi:maintenance")) {
      interaction.reply({
        embeds: [new CustomEmbed(interaction.user.id, "nypsi is currently in maintenance mode")],
      });
      return;
    }

    let order = await prisma.market.findUnique({
      where: {
        messageId: interaction.message.id,
      },
    });

    let res = await doChecks(order);

    if (!res) return;

    let value = Number(order.price);

    if (order.orderType === "buy") {
      value = Number(order.price);
    }

    let deferred = false;

    if ((await getPreferences(interaction.user.id)).marketConfirm < value) {
      const res = await showMarketConfirmationModal(interaction, value);

      if (!res) return;
    } else {
      deferred = true;
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
      if (deferred) {
        return interaction.editReply({
          embeds: [new ErrorEmbed(orderResponse.status)],
        });
      } else {
        return interaction.followUp({
          embeds: [new ErrorEmbed(orderResponse.status)],
          flags: MessageFlags.Ephemeral,
        });
      }
    } else {
      if (deferred) {
        return interaction.editReply({
          embeds: [
            new CustomEmbed(interaction.user.id).setDescription(
              `✅ you've ${order.orderType === "sell" ? "bought" : "sold"} **1x** ${getItems()[order.itemId].emoji} **[${getItems()[order.itemId].name}](https://nypsi.xyz/item/${order.itemId})** for $${order.price.toLocaleString()}`,
            ),
          ],
        });
      } else {
        return interaction.followUp({
          embeds: [
            new CustomEmbed(interaction.user.id).setDescription(
              `✅ you've ${order.orderType === "sell" ? "bought" : "sold"} **1x** ${getItems()[order.itemId].emoji} **[${getItems()[order.itemId].name}](https://nypsi.xyz/item/${order.itemId})** for $${order.price.toLocaleString()}`,
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
} as InteractionHandler;
