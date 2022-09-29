import dayjs = require("dayjs");
import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { MStoTime } from "../utils/functions/date";
import { setProgress } from "../utils/functions/economy/achievements";
import { getBalance, updateBalance } from "../utils/functions/economy/balance";
import { getInventory, setInventory } from "../utils/functions/economy/inventory";
import { createUser, getDailyStreak, getLastDaily, updateLastDaily, userExists } from "../utils/functions/economy/utils";
import { getXp, updateXp } from "../utils/functions/economy/xp";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("daily", "get your daily bonus", Categories.MONEY);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
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
    const diff = dayjs().add(1, "day").startOf("day").unix() * 1000 - dayjs().unix() * 1000;
    return send({
      embeds: [new ErrorEmbed(`your next daily bonus is available in **${MStoTime(diff)}**`).removeTitle()],
    });
  }

  const streak = await getDailyStreak(message.member);

  const base = 20000;

  let streakBonus = 5000;

  if (await isPremium(message.member)) {
    const tier = await getTier(message.member);

    switch (tier) {
      case 1:
        streakBonus = 5500;
        break;
      case 2:
        streakBonus = 6000;
        break;
      case 3:
        streakBonus = 6500;
        break;
      case 4:
        streakBonus = 7500;
        break;
    }
  }

  const total = base + streakBonus * streak;

  let xp = 1;
  let crate = 0;

  if (streak > 5) {
    xp = Math.floor((streak - 5) / 10);
  }

  if (streak > 0 && streak % 7 == 0) {
    crate++;

    crate += Math.floor(streak / 30);

    const inventory = await getInventory(message.member);

    if (inventory["basic_crate"]) {
      inventory["basic_crate"] += crate;
    } else {
      inventory["basic_crate"] = crate;
    }

    await setInventory(message.member, inventory);
  }

  await updateBalance(message.member, (await getBalance(message.member)) + total);
  await updateLastDaily(message.member);

  const embed = new CustomEmbed(message.member);
  embed.setHeader("daily", message.author.avatarURL());
  embed.setDescription(
    `+$**${total.toLocaleString()}**${crate ? `\n+ **${crate}** basic crate${crate > 1 ? "s" : ""}` : ""}\ndaily streak: \`${
      streak + 1
    }\``
  );

  if (xp > 0) {
    await updateXp(message.member, (await getXp(message.member)) + xp);
    embed.setFooter({ text: `+${xp}xp` });
  }

  await send({ embeds: [embed] });

  await setProgress(message.author.id, "streaker", streak + 1);
}

cmd.setRun(run);

module.exports = cmd;
