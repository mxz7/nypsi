import dayjs = require("dayjs");
import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addProgress } from "../utils/functions/economy/achievements";
import { addInventoryItem } from "../utils/functions/economy/inventory";
import { createUser, doDaily, getItems, getLastDaily, userExists } from "../utils/functions/economy/utils";
import { addNotificationToQueue, getDmSettings } from "../utils/functions/users/notifications";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("daily", "get your daily bonus", Categories.MONEY);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data);
        });
      }
      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
  }

  await addCooldown(cmd.name, message.member, 30);

  if (!(await userExists(message.member))) await createUser(message.member);

  const lastDaily = await getLastDaily(message.member);

  if (!dayjs(lastDaily.getTime()).isBefore(dayjs(), "day")) {
    const next = dayjs().add(1, "day").startOf("day").unix();
    return send({
      embeds: [new ErrorEmbed(`your next daily bonus is available <t:${next}:R>`).removeTitle()],
    });
  }

  const gemChance = Math.floor(Math.random() * 500);

  if (gemChance == 407) {
    await addInventoryItem(message.member, "blue_gem", 1);
    await addProgress(message.author.id, "gem_hunter", 1);

    if ((await getDmSettings(message.member)).other) {
      await addNotificationToQueue({
        memberId: message.author.id,
        payload: {
          embed: new CustomEmbed(
            message.member,
            `${getItems()["blue_gem"].emoji} you've found a gem! i wonder what powers it holds...`
          ).setTitle("you've found a gem"),
        },
      });
    }
  }

  const embed = await doDaily(message.member);

  return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
