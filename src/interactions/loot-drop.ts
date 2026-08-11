import { MessageFlags } from "discord.js";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import { handleLootDropInteraction } from "../utils/functions/economy/loot-drops";
import { logger } from "../utils/logger";

export default {
  name: "btn-loot-drop",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;

    await handleLootDropInteraction(interaction).catch(async (error) => {
      logger.error("lootdrop: interaction handler failed", {
        channelId: interaction.channelId,
        customId: interaction.customId,
        error,
        messageId: interaction.message.id,
        userId: interaction.user.id,
      });

      const payload = { embeds: [new ErrorEmbed("something went wrong, please try again")] };

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => {});
      } else {
        await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    });
  },
} as InteractionHandler;
