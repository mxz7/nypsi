import { ButtonInteraction, MessageFlags } from "discord.js";
import prisma from "../init/database";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import { isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { fulfillTradeRequest } from "../utils/functions/economy/trade_requests";

export default {
  name: "fr",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;
    if ((await isEcoBanned(interaction.user.id)).banned) return;
    const tradeRequest = await prisma.tradeRequest.findUnique({
      where: {
        messageId: interaction.message.id,
      },
    });

    if (!tradeRequest) {
      await interaction.reply({
        embeds: [new ErrorEmbed("invalid trade request")],
        ephemeral: true,
      });
      await interaction.message.delete();
      return;
    }

    if (tradeRequest && !tradeRequest?.completed && (await userExists(tradeRequest.ownerId))) {
      if (tradeRequest.ownerId == interaction.user.id) {
        return await interaction.reply({
          embeds: [new ErrorEmbed("you cannot fulfill your own trade request")],
          ephemeral: true,
        });
      }

      return fulfillTradeRequest(interaction as ButtonInteraction, tradeRequest);
    } else if (tradeRequest?.completed) {
      return await interaction.reply({
        embeds: [new ErrorEmbed("too slow ):").removeTitle()],
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        embeds: [new ErrorEmbed("invalid trade request")],
        ephemeral: true,
      });
      await interaction.message.delete();
    }
  },
} as InteractionHandler;
