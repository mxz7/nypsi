import {
  ActionRowBuilder,
  ButtonInteraction,
  Interaction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import prisma from "../init/database";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import { buyFullAuction, buyAuctionMulti } from "../utils/functions/economy/auctions";
import { isEcoBanned, userExists } from "../utils/functions/economy/utils";

export default {
  name: "b-multi",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;
    if (await isEcoBanned(interaction.user.id)) return;
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

      if (!res || !res.isModalSubmit()) return;

      const amount = parseInt(res.fields.fields.first().value);

      if (!amount)
        return res.reply({ embeds: [new ErrorEmbed("invalid amount")], ephemeral: true });

      if (auction.itemAmount == BigInt(amount)) {
        res.deferReply({ ephemeral: true });
        res.deleteReply();
        return buyFullAuction(interaction as ButtonInteraction, auction);
      }

      return buyAuctionMulti(BigInt(amount), res, auction);
    } else if (auction.sold || Number(auction.itemAmount) === 0) {
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
  const modal = new ModalBuilder().setCustomId("auction-multi-buy").setTitle("buy multiple");

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

  const filter = (i: Interaction) => i.user.id == interaction.user.id;

  return await interaction.awaitModalSubmit({ filter, time: 30000 }).catch(() => {});
}
