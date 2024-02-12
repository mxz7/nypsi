import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { addProgress } from "../utils/functions/economy/achievements";
import { getRandomImage } from "../utils/functions/image";
import { getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { addTaskProgress } from "../utils/functions/economy/tasks";

const cmd = new Command("dog", "get a random picture of a dog", "animals");

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  const image = await getRandomImage("dog").catch(() => null);

  if (!image)
    return message.channel.send({ embeds: [new ErrorEmbed("failed to find a dog image")] });

  const embed = new CustomEmbed(message.member)
    .disableFooter()
    .setImage(image.url)
    .setFooter({ text: `#${image.id}` });

  message.channel.send({ embeds: [embed] });

  addProgress(message.author.id, "cute", 1);
  addTaskProgress(message.author.id, "dogs_daily");
}

cmd.setRun(run);

module.exports = cmd;
