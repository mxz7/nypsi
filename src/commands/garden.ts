import { CommandInteraction } from "discord.js";
import { sort } from "fast-sort";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getInventory } from "../utils/functions/economy/inventory";
import { getItems } from "../utils/functions/economy/utils";

const cmd = new Command("garden", "look at all your pretty flowers", "money");

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  const inventory = await getInventory(message.member);

  const flowers = inventory.filter((i) => getItems()[i.item].role === "flower");

  if (flowers.length === 0)
    return message.channel.send({ embeds: [new ErrorEmbed("you have no flowers ):")] });

  const embed = new CustomEmbed(
    message.member,
    sort(flowers)
      .asc((i) => getItems()[i.item].name)
      .map((i) => `\`${i.amount}x\` ${getItems()[i.item].emoji} **${getItems()[i.item].name}**`)
      .join("\n"),
  ).setHeader(`${message.author.username}'s garden`, message.author.avatarURL());

  return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
