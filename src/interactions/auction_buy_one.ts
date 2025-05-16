import { ButtonInteraction, MessageFlags } from "discord.js";
import prisma from "../init/database";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import { buyAuctionOne } from "../utils/functions/economy/auctions";
import { isEcoBanned, userExists } from "../utils/functions/economy/utils";

export default {
  name: "b-one",
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
          flags: MessageFlags.Ephemeral,
        });
      }

      return buyAuctionOne(interaction as ButtonInteraction, auction);
    } else if (auction.sold || Number(auction.itemAmount) === 0) {
      return await interaction.reply({
        embeds: [new ErrorEmbed("too slow ):").removeTitle()],
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({ embeds: [new ErrorEmbed("invalid auction")], flags: MessageFlags.Ephemeral });
      await interaction.message.delete();
    }
  },
} as InteractionHandler;
