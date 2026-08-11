import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMember,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import redis from "../init/redis";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import { addProgress } from "../utils/functions/economy/achievements";
import { hasGemBeenGiven, markGemAsGiven } from "../utils/functions/economy/gems";
import { addInventoryItem, addItemSourceStat } from "../utils/functions/economy/inventory";
import {
  awaitDailyUpcomingRewardsInteraction,
  createUser,
  doDaily,
  getDailyStreak,
  getItems,
  getLastDaily,
  isEcoBanned,
  userExists,
} from "../utils/functions/economy/utils";
import { hasVoted } from "../utils/functions/economy/vote";
import { percentChance } from "../utils/functions/random";
import { addNotificationToQueue } from "../utils/functions/users/notifications";
import { getPreferences } from "../utils/functions/users/preferences";
import { logger } from "../utils/logger";
import dayjs = require("dayjs");

export default {
  name: "btn-run-daily",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;
    if ((await isEcoBanned(interaction.user.id)).banned) return;
    if (await redis.exists("nypsi:maintenance")) {
      interaction.reply({
        embeds: [new CustomEmbed(interaction.user.id, "nypsi is currently in maintenance mode")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!(await userExists(interaction.user.id))) await createUser(interaction.user.id);

    const lastDaily = await getLastDaily(interaction.user.id);

    if (!dayjs(lastDaily.getTime()).isBefore(dayjs(), "day")) {
      const next = dayjs().add(1, "day").startOf("day").unix();
      const embed = new ErrorEmbed(
        `your next daily bonus is available <t:${next}:R>`,
      ).removeTitle();
      embed.setFooter({ text: `current streak: ${await getDailyStreak(interaction.user.id)}` });

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Secondary)
          .setCustomId("btn-daily-upcoming-rewards")
          .setLabel("upcoming"),
      );

      await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
      const msg = await interaction.fetchReply();
      void awaitDailyUpcomingRewardsInteraction(msg, interaction.user.id);
      return;
    }

    if (percentChance(0.03) && !(await hasGemBeenGiven())) {
      await markGemAsGiven();
      logger.info(`${interaction.user.id} received blue_gem randomly (daily)`);
      await addInventoryItem(interaction.user.id, "blue_gem", 1);
      addItemSourceStat("blue_gem", "daily", 1);
      addProgress(interaction.user.id, "gem_hunter", 1);

      if ((await getPreferences(interaction.user.id)).dms.other) {
        addNotificationToQueue({
          memberId: interaction.user.id,
          payload: {
            embed: new CustomEmbed(
              interaction.user.id,
              `${getItems()["blue_gem"].emoji} you've found a gem! i wonder what powers it holds...`,
            ).setTitle("you've found a gem"),
          },
        });
      }
    }

    const embed = await doDaily(interaction.member as GuildMember);

    const voteButton = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL("https://top.gg/bot/678711738845102087/vote")
      .setLabel("vote for more rewards")
      .setEmoji("<:topgg:1355915569286610964>");

    const upcomingButton = new ButtonBuilder()
      .setStyle(ButtonStyle.Secondary)
      .setCustomId("btn-daily-upcoming-rewards")
      .setLabel("upcoming");

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      upcomingButton,
    );

    if (!(await hasVoted(interaction.user.id))) {
      row.addComponents(voteButton);
    }

    await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    const msg = await interaction.fetchReply();
    void awaitDailyUpcomingRewardsInteraction(msg, interaction.user.id);
    return;
  },
} as InteractionHandler;
