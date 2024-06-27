import dayjs = require("dayjs");
import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction } from "../models/Command";
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
import { percentChance } from "../utils/functions/random";
import { addNotificationToQueue, getDmSettings } from "../utils/functions/users/notifications";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import ms = require("ms");

const cmd = new Command("daily", "get your daily bonus", "money");

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data).catch(async () => {
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
    await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t");
    await redis.expire(Constants.redis.nypsi.GEM_GIVEN, Math.floor(ms("1 days") / 1000));
    await addInventoryItem(message.member, "blue_gem", 1);
    addProgress(message.author.id, "gem_hunter", 1);

    if ((await getDmSettings(message.member)).other) {
      await addNotificationToQueue({
        memberId: message.author.id,
        payload: {
          embed: new CustomEmbed(
            message.member,
            `${getItems()["blue_gem"].emoji} you've found a gem! i wonder what powers it holds...`,
          )
            .setTitle("you've found a gem")
            .setColor(Constants.TRANSPARENT_EMBED_COLOR),
        },
      });
    }
  }

  const embed = await doDaily(message.member);

  return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
