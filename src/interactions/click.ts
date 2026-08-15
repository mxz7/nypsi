import { MessageFlags } from "discord.js";
import { NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import Constants from "../utils/Constants";
import { a } from "../utils/functions/anticheat";
import { isLockedOut, verifyUser } from "../utils/functions/captcha";
import {
  addClick,
  addClickSessionReward,
  buildClickMessage,
  CLICK_BUTTON_ID,
  parseClickSessionRewards,
  rollClickLoot,
} from "../utils/functions/clicks";
import { addProgress } from "../utils/functions/economy/achievements";
import { describeLootPoolResult } from "../utils/functions/economy/loot_pools";
import { addTaskProgress } from "../utils/functions/economy/tasks";
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

    const ownsMessage = ownerId === interaction.user.id;
    const defer = setTimeout(() => {
      if (ownsMessage) interaction.deferUpdate().catch(() => {});
      else interaction.deferReply().catch(() => {});
    }, 2500);
    const computeStartedAt = performance.now();
    const sessionRewards = ownsMessage
      ? parseClickSessionRewards(interaction.message.embeds[0]?.description)
      : {};

    const [loot] = await Promise.all([
      rollClickLoot(interaction.user),
      addClick(interaction.user),
      addProgress(interaction.user, "clicker", 1),
      addTaskProgress(interaction.user, "click_daily"),
      addTaskProgress(interaction.user, "click_weekly"),
      a(interaction.user.id, interaction.user.username, "click", "click"),
    ]);

    addClickSessionReward(sessionRewards, loot);

    const message = await buildClickMessage(interaction.user, interaction.guild, sessionRewards);
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

    if (ownsMessage) {
      await interaction.update(message).catch(() => interaction.editReply(message));
    } else {
      await interaction.reply(message).catch(() => interaction.editReply(message));
    }

    if (loot.item) {
      const embed = new CustomEmbed(interaction.user)
        .setColor(Constants.EMBED_SUCCESS_COLOR)
        .setHeader(interaction.user.username, interaction.user.displayAvatarURL())
        .setDescription(`you found ${describeLootPoolResult(loot)}!`);

      setTimeout(() => interaction.followUp({ embeds: [embed] }).catch(() => {}), 500);
    }
  },
} as InteractionHandler;
