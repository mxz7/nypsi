import { CommandInteraction, Message } from "discord.js";
import fetch from "node-fetch";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { isImageUrl } from "../utils/functions/image";

const cmd = new Command("inspiration", "generate an inspirational quote (inspirobot.me)", Categories.FUN).setAliases([
  "quote",
  "inspire",
]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  await addCooldown(cmd.name, message.member, 10);

  const res = await fetch("https://inspirobot.me/api?generate=true").then((res) => res.text());

  if (!isImageUrl(res)) {
    return message.channel.send({ embeds: [new ErrorEmbed("error fetching image")] });
  }

  return message.channel.send({ embeds: [new CustomEmbed(message.member).setImage(res)] });
}

cmd.setRun(run);

module.exports = cmd;
