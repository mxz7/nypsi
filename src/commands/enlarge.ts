import { CommandInteraction, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getPrefix } from "../utils/functions/guilds/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("enlarge", "enlarge a custom emoji to its full size", Categories.UTILITY).setAliases([
  "emoji",
  "makebig",
]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  const prefix = await getPrefix(message.guild);

  if (args.length == 0) {
    return message.channel.send({
      embeds: [new ErrorEmbed(`${prefix}enlarge <emoji>`).setTitle("`❌` usage")],
    });
  }

  let emoji: string | string[] = args[0];

  emoji = emoji.split(":");

  if (!emoji[2]) {
    return message.channel.send({ embeds: [new ErrorEmbed("invalid emoji - please use a custom emoji")] });
  }

  await addCooldown(cmd.name, message.member, 5);

  const emojiID = emoji[2].slice(0, emoji[2].length - 1);

  let url = `https://cdn.discordapp.com/emojis/${emojiID}`;

  if (emoji[0].includes("a")) {
    url = url + ".gif";
  } else {
    url = url + ".png";
  }

  return message.channel.send({
    embeds: [new CustomEmbed(message.member).setImage(url).setFooter({ text: `id: ${emojiID}` })],
  });
}

cmd.setRun(run);

module.exports = cmd;
