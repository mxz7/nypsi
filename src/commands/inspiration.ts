import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { isImageUrl } from "../utils/functions/image";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command(
  "inspiration",
  "generate an inspirational quote (inspirobot.me)",
  "fun",
).setAliases(["quote", "inspire"]);

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
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
