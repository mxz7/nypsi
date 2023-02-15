import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { calcNetWorth } from "../utils/functions/economy/balance";
import { getInventory } from "../utils/functions/economy/inventory";
import { getItems } from "../utils/functions/economy/utils";
import PageManager from "../utils/functions/page";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("networth", "view breakdown of your networth", "money").setAliases(["net"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  await addCooldown(cmd.name, message.member, 30);

  const net = await calcNetWorth(message.member, true);
  const inventory = await getInventory(message.member);

  const embed = new CustomEmbed(message.member).setHeader("networth breakdown", message.author.avatarURL());

  let mainValues = `🌍 $**${net.amount.toLocaleString()}**\n`;
  const itemValues: { itemId: string; value: number }[] = [];

  for (const [key, value] of net.breakdown.entries()) {
    if (key === "balance") {
      mainValues += `\n💰 $**${value.toLocaleString()}** (${((value / net.amount) * 100).toFixed(2)}%)`;
    } else if (key === "guild") {
      mainValues += `\n👥 $**${value.toLocaleString()}** (${((value / net.amount) * 100).toFixed(2)}%)`;
    } else if (key === "workers") {
      mainValues += `\n👷🏻‍♂️ $**${value.toLocaleString()}** (${((value / net.amount) * 100).toFixed(2)}%)`;
    } else {
      itemValues.push({ itemId: key, value });
    }
  }

  inPlaceSort(itemValues).desc((i) => i.value);

  const pages = PageManager.createPages(
    itemValues.map(
      (i) =>
        `\`${inventory.find((inv) => inv.item === i.itemId).amount.toLocaleString()}x\` ${getItems()[i.itemId].emoji} ${
          getItems()[i.itemId].name
        }: $**${i.value.toLocaleString()}** (${((i.value / net.amount) * 100).toFixed(2)}%)`
    )
  );

  embed.setDescription(mainValues);
  embed.addField("items", pages.get(1).join("\n"));

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
  );
  if (pages.size == 1) return message.channel.send({ embeds: [embed] });
  const msg = await message.channel.send({ embeds: [embed], components: [row] });

  const manager = new PageManager({
    embed,
    message: msg,
    row,
    userId: message.author.id,
    pages,
    updateEmbed(page, embed) {
      embed.data.fields.length = 0;
      embed.addField("items", page.join("\n"));

      return embed;
    },
  });

  return manager.listen();
}

cmd.setRun(run);

module.exports = cmd;
