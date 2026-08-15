import { MessageFlags } from "discord.js";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import { addClick, buildClickMessage, CLICK_BUTTON_ID } from "../utils/functions/clicks";
import { logger } from "../utils/logger";

export default {
  name: CLICK_BUTTON_ID,
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;

    const ownerId = interaction.customId.split(":")[1];

    if (ownerId !== interaction.user.id) {
      return interaction.reply({
        embeds: [new ErrorEmbed("this is not your click button")],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!interaction.guild) {
      return interaction.reply({
        embeds: [new ErrorEmbed("click can only be played in a server")],
        flags: MessageFlags.Ephemeral,
      });
    }

    const defer = setTimeout(() => interaction.deferUpdate().catch(() => {}), 2500);
    const computeStartedAt = performance.now();

    await addClick(interaction.user);
    const message = await buildClickMessage(interaction.user, interaction.guild);
    const computeTime = performance.now() - computeStartedAt;

    logger.info(
      `click: computed update for ${interaction.user.id} in ${computeTime.toFixed(2)}ms`,
      {
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        computeTime,
      },
    );

    clearTimeout(defer);
    await interaction.update(message).catch(() => interaction.message.edit(message));
  },
} as InteractionHandler;
