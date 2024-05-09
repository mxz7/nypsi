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
import { buyAuctionMulti, buyFullAuction } from "../utils/functions/economy/auctions";
import { isEcoBanned, userExists } from "../utils/functions/economy/utils";
import ms = require("ms");

const userBuying = new Map<string, number>();

export default {
  name: "b-multi",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;
    if ((await isEcoBanned(interaction.user.id)).banned) return;
    const auction = await prisma.auction.findFirst({
      where: {
        AND: [{ messageId: interaction.message.id }],
      },
    });

    if (auction && !auction.sold && (await userExists(auction.ownerId))) {
      if (auction.ownerId == interaction.user.id) {
        return await interaction.reply({
          embeds: [new ErrorEmbed("you cannot buy your own auction")],
          ephemeral: true,
        });
      }

      const res = await showMultiBuyModal(interaction, Number(auction.itemAmount)).catch(
        () => null,
      );
      if (userBuying.has(interaction.user.id)) return;
      userBuying.set(interaction.user.id, auction.id);

      if (!res || !res.isModalSubmit()) return userBuying.delete(interaction.user.id);

      const amount = parseInt(res.fields.fields.first().value);

      if (!amount || amount < 1)
        return res.reply({ embeds: [new ErrorEmbed("invalid amount")], ephemeral: true });

      if (auction.itemAmount == BigInt(amount)) {
        res.deferReply({ ephemeral: true });
        res.deleteReply();
        return buyFullAuction(interaction as ButtonInteraction, auction);
      }
      setTimeout(() => userBuying.delete(interaction.user.id), ms("1 minute"));

      return buyAuctionMulti(BigInt(amount), res, auction);
    } else if (auction?.sold || Number(auction.itemAmount) === 0) {
      return await interaction.reply({
        embeds: [new ErrorEmbed("too slow ):").removeTitle()],
        ephemeral: true,
      });
    } else {
      await interaction.reply({ embeds: [new ErrorEmbed("invalid auction")], ephemeral: true });
      await interaction.message.delete();
    }
  },
} as InteractionHandler;

async function showMultiBuyModal(interaction: ButtonInteraction, maxAmount: number) {
  const id = `auction-confirm-${Math.floor(Math.random() * 69420)}`;
  const modal = new ModalBuilder().setCustomId(id).setTitle("buy multiple");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("amount")
        .setLabel("how many do you want to buy?")
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
