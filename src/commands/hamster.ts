import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { addProgress } from "../utils/functions/economy/achievements";
import { getRandomImage } from "../utils/functions/image";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("hamster", "get a random picture of a hamster", "animals");

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  await addCooldown(cmd.name, message.member, 3);

  const image = await getRandomImage("hamster").catch(() => null);

  if (!image)
    return message.channel.send({ embeds: [new ErrorEmbed("failed to find a hamster image")] });

  const embed = new CustomEmbed(message.member).disableFooter().setImage(image.url);

  if (image.name) {
    embed.setTitle(image.name);
    embed.setURL(`https://animals.maxz.dev/hamster/${image.id}`);
  }

  if (Math.floor(Math.random() * 25) === 7)
    embed.setFooter({ text: `upload your pets: animals.maxz.dev` });

  message.channel.send({ embeds: [embed] });

  addProgress(message.author.id, "cute", 1);
}

cmd.setRun(run);

module.exports = cmd;
