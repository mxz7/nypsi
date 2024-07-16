import { ColorResolvable, CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { imageExists, uploadImage } from "../utils/functions/image";
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
    if (args[0].match(Constants.COLOUR_REGEX)) color = args[0].substring(1);
    else {
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

  const id = `colour/${color}/54x42`;

  if (!(await imageExists(id))) {
    const res = await fetch(`https://singlecolorimage.com/get/${color}/54x42`);

    if (res.ok && res.status === 200) {
      const arrayBuffer = await res.arrayBuffer();
      await uploadImage(id, Buffer.from(arrayBuffer), "image/png");
    }
  }

  embed.setImage(`https://cdn.nypsi.xyz/${id}`);

  return await message.channel.send({ embeds: [embed] }).catch(() => {
    message.channel.send({ embeds: [new ErrorEmbed("invalid color")] });
  });
}

cmd.setRun(run);

module.exports = cmd;
