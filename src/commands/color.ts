import { ColorResolvable, CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getMember } from "../utils/functions/member";

const cmd = new Command("color", "get a random hex color code", "info").setAliases(["colour"]);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  let color;
  let member;

  if (args.length == 0) {
    color = Math.floor(Math.random() * 16777215).toString(16);
    while (color.length != 6) {
      color = Math.floor(Math.random() * 16777215).toString(16);
    }
  }

  if (args.length != 0) {
    member = await getMember(message.guild, args.join(" "));

    if (!member) {
      color = args[0].split("#").join("");
      if (color.length > 6) {
        color = color.substring(0, 6);
      }
    } else {
      color = member.displayHexColor.substring(1);
    }
  }

  const embed = new CustomEmbed(message.member).setHeader(`#${color}`);

  try {
    embed.setColor(color as ColorResolvable);
  } catch {
    return message.channel.send({ embeds: [new ErrorEmbed("invalid color")] });
  }

  if (member) {
    embed.setDescription(member.user.toString());
    embed.setHeader(member.displayHexColor);
  }

  embed.setImage(`https://singlecolorimage.com/get/${color}/54x42`);

  return await message.channel.send({ embeds: [embed] }).catch(() => {
    message.channel.send({ embeds: [new ErrorEmbed("invalid color")] });
  });
}

cmd.setRun(run);

module.exports = cmd;
