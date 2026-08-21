import { ComponentType, MessageFlags } from "discord.js";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import Constants from "../utils/Constants";
import { a } from "../utils/functions/anticheat";
import { isLockedOut, verifyUser } from "../utils/functions/captcha";
import {
  addClick,
  addClickSessionReward,
  buildClickButtonRow,
  buildClickMessage,
  CLICK_BUTTON_ID,
  parseClickSessionRewards,
  rollClickLoot,
} from "../utils/functions/clicks";
import { addProgress } from "../utils/functions/economy/achievements";
import { addEventProgress } from "../utils/functions/economy/events";
import { describeLootPoolResult } from "../utils/functions/economy/loot_pools";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import { createUser, isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { logger } from "../utils/logger";

export default {
  name: CLICK_BUTTON_ID,
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;

    const ownerId = interaction.customId.split(":")[1];

    if (!(await userExists(interaction.user.id))) {
      await createUser(interaction.user.id);
    }

    if (!interaction.guild) {
      return interaction.reply({
        embeds: [new ErrorEmbed("click can only be played in a server")],
        flags: MessageFlags.Ephemeral,
      });
    }

    const lockedOut = await isLockedOut(interaction.user);
    const existingRow = interaction.message.components[0];
    const hasCaptchaWarning =
      existingRow?.data.type === ComponentType.ActionRow &&
      "components" in existingRow &&
      existingRow.components.length > 1;
    const componentData =
      "data" in interaction.component ? interaction.component.data : interaction.component;
    const buttonLabel = "label" in componentData ? componentData.label : "0";
    const captchaMention = `<@${interaction.user.id}>`;
    const captchaMessageChanged = lockedOut
      ? interaction.message.content !== captchaMention
      : interaction.message.content.length > 0;

    if (Boolean(lockedOut) !== hasCaptchaWarning || captchaMessageChanged) {
      await interaction.message.edit({
        content: lockedOut ? captchaMention : "",
        allowedMentions: { users: lockedOut ? [interaction.user.id] : [] },
        components: [buildClickButtonRow(ownerId, buttonLabel ?? "0", Boolean(lockedOut))],
      });
    }

    if (lockedOut) {
      const message = interaction as unknown as NypsiMessage;

      message.author = interaction.user;
      message.content = "click";
      return verifyUser(message);
    }

    if ((await isEcoBanned(interaction.user)).banned) return;

    const clickCooldownKey = `nypsi:click-cooldown:${interaction.user.id}`;
    const claimedClick = await redis.set(clickCooldownKey, "1", "PX", 750, "NX");

    if (!claimedClick) {
      logger.warn(`clicks: ${interaction.user.id} too fast`);
      return interaction.deferUpdate().catch(() => {});
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

    const writesStartedAt = performance.now();
    const [loot, eventProgress] = await Promise.all([
      rollClickLoot(interaction.user),
      addEventProgress(interaction.client as NypsiClient, interaction.user, "clicks", 1),
      addClick(interaction.user),
      addProgress(interaction.user, "clicker", 1),
      addTaskProgress(interaction.user, "click_daily"),
      addTaskProgress(interaction.user, "click_weekly"),
      a(interaction.user.id, interaction.user.username, "click", "click"),
    ]);
    const writesTime = performance.now() - writesStartedAt;

    addClickSessionReward(sessionRewards, loot);

    const messageBuildStartedAt = performance.now();
    const needsCaptcha = Boolean(await isLockedOut(interaction.user));
    const message = await buildClickMessage(
      interaction.user,
      interaction.guild,
      sessionRewards,
      needsCaptcha,
      eventProgress,
    );
    const messageBuildTime = performance.now() - messageBuildStartedAt;
    const computeTime = performance.now() - computeStartedAt;

    logger.info(
      `click: computed update for ${interaction.user.id} in ${computeTime.toFixed(2)}ms (writes ${writesTime.toFixed(2)}ms, message ${messageBuildTime.toFixed(2)}ms)`,
      {
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        computeTime,
        writesTime,
        messageBuildTime,
      },
    );

    clearTimeout(defer);

    if (ownsMessage) {
      await interaction.update(message).catch(() => interaction.editReply(message));
    } else {
      await interaction.reply(message).catch(() => interaction.editReply(message));
    }

    if (Object.keys(loot).length > 0) {
      const embed = new CustomEmbed(interaction.user)
        .setColor(Constants.EMBED_SUCCESS_COLOR)
        .setHeader(interaction.user.username, interaction.user.displayAvatarURL())
        .setDescription(`you found ${describeLootPoolResult(loot)}!`);

      setTimeout(() => interaction.followUp({ embeds: [embed] }).catch(() => {}), 500);
    }
  },
} as InteractionHandler;
