import dayjs = require("dayjs");
import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { addProgress } from "../utils/functions/economy/achievements";
import { addInventoryItem } from "../utils/functions/economy/inventory";
import {
  createUser,
  doDaily,
  getDailyStreak,
  getItems,
  getLastDaily,
  userExists,
} from "../utils/functions/economy/utils";
import { hasVoted } from "../utils/functions/economy/vote";
import { percentChance } from "../utils/functions/random";
import { addNotificationToQueue, getDmSettings } from "../utils/functions/users/notifications";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";
import ms = require("ms");

const cmd = new Command("daily", "get your daily bonus", "money");

cmd.slashEnabled = true;

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data as InteractionEditReplyOptions).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data as InteractionEditReplyOptions).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        });
      }

      if (usedNewMessage && res instanceof Message) return res;

      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  await addCooldown(cmd.name, message.member, 30);

  if (!(await userExists(message.member))) await createUser(message.member);

  const lastDaily = await getLastDaily(message.member);

  if (!dayjs(lastDaily.getTime()).isBefore(dayjs(), "day")) {
    const next = dayjs().add(1, "day").startOf("day").unix();
    const embed = new ErrorEmbed(`your next daily bonus is available <t:${next}:R>`).removeTitle();
    embed.setFooter({ text: `current streak: ${await getDailyStreak(message.member)}` });
    return send({ embeds: [embed] });
  }

  if (percentChance(0.03) && !(await redis.exists(Constants.redis.nypsi.GEM_GIVEN))) {
    await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t", "EX", 86400);
    logger.info(`${message.author.id} received blue_gem randomly (daily)`);
    await addInventoryItem(message.member, "blue_gem", 1);
    addProgress(message.author.id, "gem_hunter", 1);

    if ((await getDmSettings(message.member)).other) {
      addNotificationToQueue({
        memberId: message.author.id,
        payload: {
          embed: new CustomEmbed(
            message.member,
            `${getItems()["blue_gem"].emoji} you've found a gem! i wonder what powers it holds...`,
          ).setTitle("you've found a gem"),
        },
      });
    }
  }

  const embed = await doDaily(message.member);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL("https://top.gg/bot/678711738845102087/vote")
      .setLabel("vote for more rewards")
      .setEmoji("<:topgg:1355915569286610964>"),
  );

  if (!(await hasVoted(message.member))) {
    return send({ embeds: [embed], components: [row] });
  } else {
    return send({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;
