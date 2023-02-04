import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { hasPadlock } from "../utils/functions/economy/balance";
import { createUser, getPadlockPrice, userExists } from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";

const cmd = new Command("padlock", "buy a padlock to protect your wallet", "money");

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (!(await userExists(message.member))) await createUser(message.member);

  const embed = new CustomEmbed(message.member).setHeader("padlock", message.author.avatarURL());

  const padlockPrice = getPadlockPrice();
  const prefix = await getPrefix(message.guild);

  if (args.length == 1) {
    return message.channel.send({
      embeds: [new ErrorEmbed(`this has been moved to ${prefix}**buy padlock**`)],
    });
  } else {
    if (await hasPadlock(message.member)) {
      embed.setColor(Constants.EMBED_SUCCESS_COLOR);
      embed.setDescription("**protected** 🔒\nyou currently have a padlock");
      return await message.channel.send({ embeds: [embed] }).catch(() => {});
    } else {
      embed.setDescription(
        `**vulnerable** 🔓\nyou do not have a padlock\nyou can buy one for $**${padlockPrice.toLocaleString()}** with ${prefix}buy padlock`
      );
      embed.setColor(Constants.EMBED_FAIL_COLOR);
      return await message.channel.send({ embeds: [embed] }).catch(() => {});
    }
  }
}

cmd.setRun(run);

module.exports = cmd;
