import { Market } from "@prisma/client";
import { MessageFlags } from "discord.js";
import prisma from "../init/database";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import { getBalance } from "../utils/functions/economy/balance";
import { calcItemValue, getInventory } from "../utils/functions/economy/inventory";
import {
  marketBuy,
  marketSell,
  showMarketConfirmationModal,
} from "../utils/functions/economy/market";
import { getItems, isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { getPreferences } from "../utils/functions/users/notifications";

export default {
  name: "market-full",
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

        if (balance < Number(order.price * order.itemAmount)) {
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

        if ((inventory.find((i) => i.item)?.amount || 0) < order.itemAmount) {
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
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let order = await prisma.market.findUnique({
      where: {
        messageId: interaction.message.id,
      },
    });

    if (!(await doChecks(order))) return;

    let deferred = false;

    if (order.orderType == "sell") {
      const value = Number(order.price * order.itemAmount);

      if ((await getPreferences(interaction.user.id)).marketConfirm < value) {
        const res = await showMarketConfirmationModal(interaction, "buy", value);

        if (!res) return;
      } else {
        deferred = true;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }
    } else {
      const worth = await calcItemValue(order.itemId);
      console.log(worth);
      if (worth * 1.25 > Number(order.price)) {
        const res = await showMarketConfirmationModal(interaction, "sell", worth);

        if (!res) return;
      } else {
        deferred = true;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }
    }

    order = await prisma.market.findUnique({
      where: {
        id: order.id,
      },
    });

    if (!(await doChecks(order))) return;

    const res =
      order.orderType == "buy"
        ? await marketSell(
            interaction.user.id,
            order.itemId,
            Number(order.itemAmount),
            Number(order.price * order.itemAmount),
            interaction.client as NypsiClient,
            order.id,
          )
        : await marketBuy(
            interaction.user.id,
            order.itemId,
            Number(order.itemAmount),
            Number(order.price * order.itemAmount),
            interaction.client as NypsiClient,
            order.id,
          );

    if (res && res.status !== "success" && res.status !== "partial") {
      if (deferred) {
        return interaction.editReply({
          embeds: [new ErrorEmbed(res.status)],
        });
      } else {
        return await interaction.followUp({
          embeds: [new ErrorEmbed(res.status)],
          flags: MessageFlags.Ephemeral,
        });
      }
    } else {
      if (deferred) {
        return interaction.editReply({
          embeds: [
            new CustomEmbed(interaction.user.id).setDescription(
              `✅ you've ${order.orderType === "sell" ? "bought" : "sold"} **${(Number(order.itemAmount) - res.remaining).toLocaleString()}x** ${getItems()[order.itemId].emoji} **[${getItems()[order.itemId].name}](https://nypsi.xyz/item/${order.itemId})** for $${(order.price * order.itemAmount).toLocaleString()}`,
            ),
          ],
        });
      } else {
        return interaction.followUp({
          embeds: [
            new CustomEmbed(interaction.user.id).setDescription(
              `✅ you've ${order.orderType === "sell" ? "bought" : "sold"} **${(Number(order.itemAmount) - res.remaining).toLocaleString()}x** ${getItems()[order.itemId].emoji} **[${getItems()[order.itemId].name}](https://nypsi.xyz/item/${order.itemId})** for $${(order.price * order.itemAmount).toLocaleString()}`,
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
} as InteractionHandler;
