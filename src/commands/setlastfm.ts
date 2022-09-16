import { CommandInteraction, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { getPrefix } from "../utils/functions/guilds/utils";
import { cleanString } from "../utils/functions/string";
import { getLastfmUsername, setLastfmUsername } from "../utils/functions/users/lastfm";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("setlastfm", "set your last.fm username", Categories.MUSIC).setAliases(["slfm"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member);

    const username = await getLastfmUsername(message.member);

    if (username) {
      embed.setDescription(`your last.fm username is set to \`${username}\``);
    } else {
      embed.setDescription(`your username has not been set, ${await getPrefix(message.guild)}**slfm <username>**`);
    }

    return message.channel.send({ embeds: [embed] });
  }

  const res = await setLastfmUsername(message.member, args[0]);

  await addCooldown(cmd.name, message.member, 30);

  const embed = new CustomEmbed(message.member);

  if (res) {
    embed.setDescription(`your last.fm username has been set to \`${cleanString(args[0])}\``);
  } else {
    embed.setDescription(`\`${cleanString(args[0])}\` is not a valid last.fm username`);
  }

  return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
