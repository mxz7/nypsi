import { CommandInteraction } from "discord.js";
import { sort } from "fast-sort";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getInventory } from "../utils/functions/economy/inventory";
import { getItems } from "../utils/functions/economy/utils";
import PageManager from "../utils/functions/page";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("collect", "check your item collection progress", "money");

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  let items = Array.from(Object.values(getItems()));

  if (args.length > 0) {
    items = items.filter((i) => i.role === args[0].toLowerCase());
  }

  if (items.length === 0)
    return message.channel.send({ embeds: [new ErrorEmbed("no items with that role exist")] });

  await addCooldown(cmd.name, message.member, 5);

  const inventory = await getInventory(message.member);

  let hasCount = 0;
  const desc: string[] = [];

  for (const item of sort(items).asc((i) => i.name)) {
    const count = inventory.find((i) => i.item === item.id)?.amount || 0;

    if (count > 0) hasCount++;

    desc.push(`\`${count.toLocaleString()}x\` ${item.emoji} **${item.name}**`);
  }

  const pages = PageManager.createPages(desc, 15);

  const embed = new CustomEmbed(message.member, pages.get(1).join("\n"))
    .setFooter({
      text: `${hasCount}/${items.length} (${((hasCount / items.length) * 100).toFixed(1)}%)`,
    })
    .setHeader(
      `${args.length === 0 ? "all items" : args[0].toLowerCase()}`,
      message.author.avatarURL(),
    );

  if (pages.size === 1) {
    return message.channel.send({ embeds: [embed] });
  }

  const row = PageManager.defaultRow();

  const msg = await message.channel.send({ embeds: [embed], components: [row] });

  const manager = new PageManager({
    embed,
    message: msg,
    row,
    userId: message.author.id,
    allowMessageDupe: true,
    pages,
  });

  return manager.listen();
}

cmd.setRun(run);

module.exports = cmd;
