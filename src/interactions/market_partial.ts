import {
  ActionRowBuilder,
  ButtonInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import prisma from "../init/database";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import { isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { OrderType } from "@prisma/client";
import { marketBuy, marketSell } from "../utils/functions/economy/market";
import { NypsiClient } from "../models/Client";

const userFulfilling = new Map<string, number>();

export default {
  name: "market-partial",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;
    if ((await isEcoBanned(interaction.user.id)).banned) return;
    const order = await prisma.market.findFirst({
      where: {
        AND: [{ messageId: interaction.message.id }],
      },
    });

    if (order && !order.completed && (await userExists(order.ownerId))) {
      if (order.ownerId == interaction.user.id) {
        return await interaction.reply({
          embeds: [new ErrorEmbed("you cannot fulfill your own order")],
          ephemeral: true,
        });
      }

      const res = await showMultiModal(interaction, order.orderType == "buy" ? "sell" : "buy", Number(order.itemAmount)).catch(() => {});
      if (userFulfilling.has(interaction.user.id)) return;
      userFulfilling.set(interaction.user.id, order.id);

      if (!res || !res.isModalSubmit()) return userFulfilling.delete(interaction.user.id);

      const amount = Math.min(parseInt(res.fields.fields.first().value), Number(order.itemAmount));

      if (!amount || amount < 1) {
        userFulfilling.delete(interaction.user.id);
        return res.reply({ embeds: [new ErrorEmbed("invalid amount")], ephemeral: true });
      }

      userFulfilling.delete(interaction.user.id);
      
      const marketRes = order.orderType == "buy"
        ? await marketSell(interaction.user.id, order.itemId, amount, Number(order.price) * amount, interaction.client as NypsiClient, order)
        : await marketBuy(interaction.user.id, order.itemId, amount, Number(order.price) * amount, interaction.client as NypsiClient, order);
        
      if (marketRes && marketRes.status !== "success" && marketRes.status !== "partial") {
        return await res.reply({
          embeds: [new ErrorEmbed(marketRes.status)],
          ephemeral: true,
        });
      } else return interaction.deferUpdate();
    } else if (order?.completed || Number(order.itemAmount) === 0) {
      userFulfilling.delete(interaction.user.id);
      return await interaction.reply({
        embeds: [new ErrorEmbed("too slow ):").removeTitle()],
        ephemeral: true,
      });
    } else {
      userFulfilling.delete(interaction.user.id);
      await interaction.reply({ embeds: [new ErrorEmbed("invalid order")], ephemeral: true });
      await interaction.message.delete();
    }
  },
} as InteractionHandler;

async function showMultiModal(interaction: ButtonInteraction, action: OrderType, maxAmount: number) {
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