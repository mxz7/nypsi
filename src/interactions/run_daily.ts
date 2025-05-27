import { ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildMember, MessageActionRowComponentBuilder, MessageFlags } from "discord.js";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import { addInventoryItem } from "../utils/functions/economy/inventory";
import { createUser, doDaily, getDailyStreak, getItems, getLastDaily, isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { addNotificationToQueue, getDmSettings } from "../utils/functions/users/notifications";
import { percentChance } from "../utils/functions/random";
import Constants from "../utils/Constants";
import { logger } from "../utils/logger";
import { addProgress } from "../utils/functions/economy/achievements";
import { hasVoted } from "../utils/functions/economy/vote";
import redis from "../init/redis";
import dayjs = require("dayjs");

export default {
  name: "run-daily",
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
      const embed = new ErrorEmbed(`your next daily bonus is available <t:${next}:R>`).removeTitle();
      embed.setFooter({ text: `current streak: ${await getDailyStreak(interaction.user.id)}` });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (percentChance(0.03) && !(await redis.exists(Constants.redis.nypsi.GEM_GIVEN))) {
      await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t", "EX", 86400);
      logger.info(`${interaction.user.id} received blue_gem randomly (daily)`);
      await addInventoryItem(interaction.user.id, "blue_gem", 1);
      addProgress(interaction.user.id, "gem_hunter", 1);

      if ((await getDmSettings(interaction.user.id)).other) {
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

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setURL("https://top.gg/bot/678711738845102087/vote")
        .setLabel("vote for more rewards")
        .setEmoji("<:topgg:1355915569286610964>"),
    );

    if (!(await hasVoted(interaction.user.id))) {
      return interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    } else {
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
} as InteractionHandler;
