import { ButtonInteraction } from "discord.js";
import prisma from "../init/database";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import { buyFullAuction } from "../utils/functions/economy/auctions";
import { isEcoBanned, userExists } from "../utils/functions/economy/utils";

export default {
  name: "b",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;
    if (await isEcoBanned(interaction.user.id)) return;
    const auction = await prisma.auction.findFirst({
      where: {
        AND: [{ messageId: interaction.message.id }],
      },
    });

    if (!auction) {
      await interaction.reply({ embeds: [new ErrorEmbed("invalid auction")], ephemeral: true });
      await interaction.message.delete();
      return;
    }

    if (auction && !auction?.sold && (await userExists(auction.ownerId))) {
      if (auction.ownerId == interaction.user.id) {
        return await interaction.reply({
          embeds: [new ErrorEmbed("you cannot buy your own auction")],
          ephemeral: true,
        });
      }

      return buyFullAuction(interaction as ButtonInteraction, auction);
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
