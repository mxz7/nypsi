import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addProgress } from "../utils/functions/economy/achievements";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import { getRandomImage } from "../utils/functions/image";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("cat", "get a random picture of a cat", "animals").setAliases([
  "kitty",
  "meow",
  "chipichipichapachapaloobieloobielabalabamagicomiloobieloobieboomboomboomboom",
]);

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  await addCooldown(cmd.name, message.member, 3);

  const image = await getRandomImage("cat").catch(() => null);

  if (!image)
    return message.channel.send({ embeds: [new ErrorEmbed("failed to find a cat image")] });

  const embed = new CustomEmbed(message.member).disableFooter().setImage(image.url);

  if (image.name) {
    embed.setTitle(image.name);
    embed.setURL(`https://animals.maxz.dev/cat/${image.id}`);
  }

  if (Math.floor(Math.random() * 25) === 7)
    embed.setFooter({ text: `upload your pets: animals.maxz.dev` });

  message.channel.send({ embeds: [embed] });

  addProgress(message.author.id, "cute", 1);
  addTaskProgress(message.author.id, "cats_daily");
}

cmd.setRun(run);

module.exports = cmd;
