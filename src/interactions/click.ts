import { MessageFlags } from "discord.js";
import { NypsiMessage } from "../models/Command";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import { a } from "../utils/functions/anticheat";
import { isLockedOut, verifyUser } from "../utils/functions/captcha";
import { addClick, buildClickMessage, CLICK_BUTTON_ID } from "../utils/functions/clicks";
import { isEcoBanned } from "../utils/functions/economy/utils";
import { logger } from "../utils/logger";

export default {
  name: CLICK_BUTTON_ID,
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;
    if ((await isEcoBanned(interaction.user)).banned) return;

    const ownerId = interaction.customId.split(":")[1];

    if (!interaction.guild) {
      return interaction.reply({
        embeds: [new ErrorEmbed("click can only be played in a server")],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (await isLockedOut(interaction.user)) {
      const message = interaction as unknown as NypsiMessage;

      message.author = interaction.user;
      message.content = "click";
      return verifyUser(message);
    }

    if (ownerId !== interaction.user.id) {
      const defer = setTimeout(() => interaction.deferReply().catch(() => {}), 2500);
      const computeStartedAt = performance.now();

      await a(interaction.user.id, interaction.user.username, "click", "click");
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
      return interaction.reply(message).catch(() => interaction.editReply(message));
    }

    const defer = setTimeout(() => interaction.deferUpdate().catch(() => {}), 2500);
    const computeStartedAt = performance.now();

    await a(interaction.user.id, interaction.user.username, "click", "click");
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
    await interaction.update(message).catch(() => interaction.editReply(message));
  },
} as InteractionHandler;
