import dayjs = require("dayjs");
import { CommandInteraction, InteractionReplyOptions, Message, MessageOptions } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { setProgress } from "../utils/economy/achievements";
import {
  createUser,
  getBalance,
  getDailyStreak,
  getLastDaily,
  getXp,
  updateBalance,
  updateLastDaily,
  updateXp,
  userExists,
} from "../utils/economy/utils";
import { MStoTime } from "../utils/functions/date";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";
import { getTier, isPremium } from "../utils/premium/utils";

const cmd = new Command("daily", "get your daily bonus", Categories.MONEY);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  const send = async (data: MessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions);
      }
      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as MessageOptions);
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
    const diff = dayjs().add(1, "day").startOf("day").unix() * 1000 - dayjs().unix() * 1000;
    return send({
      embeds: [new ErrorEmbed(`your next daily bonus is available in **${MStoTime(diff)}**`).removeTitle()],
    });
  }

  const streak = await getDailyStreak(message.member);

  const base = 20000;

  let streakBonus = 850;

  if (await isPremium(message.member)) {
    const tier = await getTier(message.member);

    switch (tier) {
      case 1:
        streakBonus = 900;
        break;
      case 2:
        streakBonus = 950;
        break;
      case 3:
        streakBonus = 1000;
        break;
      case 4:
        streakBonus = 1100;
        break;
    }
  }

  const total = base + streakBonus * streak;

  let xp = 1;

  if (streak > 20) {
    xp = Math.floor((streak - 20) / 15);
  }

  await updateBalance(message.member, (await getBalance(message.member)) + total);
  await updateLastDaily(message.member);

  const embed = new CustomEmbed(message.member);
  embed.setHeader("daily", message.author.avatarURL());
  embed.setDescription(`+$**${total.toLocaleString()}**\ndaily streak: \`${streak + 1}\``);

  if (xp > 0) {
    await updateXp(message.member, (await getXp(message.member)) + xp);
    embed.setFooter({ text: `+${xp}xp` });
  }

  await send({ embeds: [embed] });

  await setProgress(message.author.id, "streaker", streak + 1);
}

cmd.setRun(run);

module.exports = cmd;
