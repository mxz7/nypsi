import { ButtonInteraction } from "discord.js";
import prisma from "../init/database";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import { isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { fulfillItemRequest } from "../utils/functions/economy/item_requests";

export default {
  name: "fr",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;
    if ((await isEcoBanned(interaction.user.id)).banned) return;
    const itemRequest = await prisma.itemRequest.findFirst({
      where: {
        AND: [{ messageId: interaction.message.id }],
      },
    });

    if (!itemRequest) {
      await interaction.reply({ embeds: [new ErrorEmbed("invalid item request")], ephemeral: true });
      await interaction.message.delete();
      return;
    }

    if (itemRequest && !itemRequest?.completed && (await userExists(itemRequest.ownerId))) {
      if (itemRequest.ownerId == interaction.user.id) {
        return await interaction.reply({
          embeds: [new ErrorEmbed("you cannot fulfill your own item request")],
          ephemeral: true,
        });
      }

      return fulfillItemRequest(interaction as ButtonInteraction, itemRequest);
    } else if (itemRequest?.completed) {
      return await interaction.reply({
        embeds: [new ErrorEmbed("too slow ):").removeTitle()],
        ephemeral: true,
      });
    } else {
      await interaction.reply({ embeds: [new ErrorEmbed("invalid item request")], ephemeral: true });
      await interaction.message.delete();
    }
  },
} as InteractionHandler;
