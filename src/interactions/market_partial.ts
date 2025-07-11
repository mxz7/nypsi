import { OrderType } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonInteraction,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import prisma from "../init/database";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import { getBalance } from "../utils/functions/economy/balance";
import { getInventory } from "../utils/functions/economy/inventory";
import { marketBuy, marketSell } from "../utils/functions/economy/market";
import { getItems, isEcoBanned, userExists } from "../utils/functions/economy/utils";

const userFulfilling = new Map<string, number>();

export default {
  name: "market-partial",
  type: "interaction",
  async run(interaction) {
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

    if (!order || !(await userExists(order.ownerId))) {
      await interaction.reply({
        embeds: [new ErrorEmbed("invalid order")],
        flags: MessageFlags.Ephemeral,
      });
      await interaction.message.delete();
      return;
    }

    if (order.completed || order.itemAmount <= 0) {
      await interaction.reply({
        embeds: [new ErrorEmbed("too slow ):")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (order.ownerId == interaction.user.id) {
      return await interaction.reply({
        embeds: [new ErrorEmbed("you cannot fulfill your own order")],
        flags: MessageFlags.Ephemeral,
      });
    }

    const res = await showMultiModal(
      interaction,
      order.orderType == "buy" ? "sell" : "buy",
      order.itemAmount,
    ).catch(() => {});

    if (userFulfilling.has(interaction.user.id)) return;
    userFulfilling.set(interaction.user.id, order.id);

    if (!res || !res.isModalSubmit()) return userFulfilling.delete(interaction.user.id);

    let input = res.fields.fields.first().value;

    if (input.toLowerCase() == "all") {
      if (order.orderType == "buy") {
        input = (await getInventory(interaction.user.id)).count(order.itemId).toString();
      } else {
        input = order.itemAmount.toString();

        const balance = await getBalance(interaction.user.id);

        if (order.itemAmount * Number(order.price) > balance)
          input = Math.floor(balance / Number(order.price)).toString();
      }
    }

    if (!parseInt(input) || isNaN(parseInt(input)) || parseInt(input) < 1) {
      userFulfilling.delete(interaction.user.id);
      return res.reply({
        embeds: [new ErrorEmbed("invalid amount")],
        flags: MessageFlags.Ephemeral,
      });
    }

    const amount = Math.min(parseInt(input), order.itemAmount);

    userFulfilling.delete(interaction.user.id);

    await res.deferReply({ flags: MessageFlags.Ephemeral });

    order = await prisma.market.findUnique({ where: { messageId: interaction.message.id } });

    if (!order || !(await userExists(order.ownerId))) {
      await res.editReply({
        embeds: [new ErrorEmbed("invalid order")],
      });
      await interaction.message.delete();
      return;
    }

    if (order.completed || order.itemAmount <= 0) {
      await res.editReply({
        embeds: [new ErrorEmbed("too slow ):")],
      });
      return;
    }

    const marketRes =
      order.orderType == "buy"
        ? await marketSell(
            interaction.user.id,
            order.itemId,
            amount,
            Number(order.price) * amount,
            interaction.client as NypsiClient,
            order.id,
          )
        : await marketBuy(
            interaction.user.id,
            order.itemId,
            amount,
            Number(order.price) * amount,
            interaction.client as NypsiClient,
            order.id,
          );

    if (marketRes && marketRes.status !== "success" && marketRes.status !== "partial") {
      return await res.editReply({
        embeds: [new ErrorEmbed(marketRes.status)],
      });
    } else {
      return res.editReply({
        embeds: [
          new CustomEmbed(interaction.user.id).setDescription(
            `✅ you've ${order.orderType === "sell" ? "bought" : "sold"} **${(amount - marketRes.remaining).toLocaleString()}x** ${getItems()[order.itemId].emoji} **[${getItems()[order.itemId].name}](https://nypsi.xyz/items/${order.itemId})** for $${((amount - marketRes.remaining) * Number(order.price)).toLocaleString()}`,
          ),
        ],
      });
    }
  },
} as InteractionHandler;

async function showMultiModal(
  interaction: ButtonInteraction,
  action: OrderType,
  maxAmount: number,
) {
  const id = `market-confirm-${Math.floor(Math.random() * 69420)}`;
  const modal = new ModalBuilder().setCustomId(id).setTitle(`${action} multiple`);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("amount")
        .setLabel(`how many do you want to ${action}?`)
        .setPlaceholder(`maximum amount: ${maxAmount}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10),
    ),
  );

  await interaction.showModal(modal);

  const filter = (i: ModalSubmitInteraction) =>
    i.user.id == interaction.user.id && i.customId === id;

  return await interaction.awaitModalSubmit({ filter, time: 30000 }).catch(() => {});
}
