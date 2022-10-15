import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { getAuctionAverage } from "../utils/functions/economy/auctions";
import { getInventory, getTotalAmountOfItem } from "../utils/functions/economy/inventory";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { Item } from "../utils/models/Economy";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("item", "view information about an item", Categories.MONEY);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option.setName("item-global").setDescription("item you want to view info for").setAutocomplete(true).setRequired(true)
);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions);
      }
      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  if (!(await userExists(message.member))) await createUser(message.member);

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
  }

  if (args.length == 0) {
    return send({ embeds: [new ErrorEmbed("/item <item>")] });
  }

  const items = getItems();

  const searchTag = args.join(" ").toLowerCase();

  let selected: Item;

  for (const itemName of Array.from(Object.keys(items))) {
    const aliases = items[itemName].aliases ? items[itemName].aliases : [];
    if (searchTag == itemName) {
      selected = items[itemName];
      break;
    } else if (searchTag == itemName.split("_").join("")) {
      selected = items[itemName];
      break;
    } else if (aliases.indexOf(searchTag) != -1) {
      selected = items[itemName];
      break;
    } else if (searchTag == items[itemName].name) {
      selected = items[itemName];
      break;
    }
  }

  if (!selected) {
    return send({ embeds: [new ErrorEmbed(`couldnt find \`${args.join(" ")}\``)] });
  }

  await addCooldown(cmd.name, message.member, 7);

  const embed = new CustomEmbed(message.member).setTitle(`${selected.emoji} ${selected.name}`);

  let desc = `\`${selected.id}\`\n\n*${selected.longDesc}*\n\n`;

  if (selected.buy) {
    desc += `**buy** $${selected.buy.toLocaleString()}\n`;
  }

  if (selected.sell) {
    desc += `**sell** $${selected.sell.toLocaleString()}\n`;
  }

  const avg = await getAuctionAverage(selected.id);
  const total = await getTotalAmountOfItem(selected.id);
  const inventory = await getInventory(message.member);

  if (avg) {
    desc += `**average auction sale** $${Math.floor(avg).toLocaleString()}\n`;
  }

  if (total) {
    const percentOwned = (inventory.find((i) => i.item == selected.id).amount / total) * 100;

    desc += `**in world** ${total.toLocaleString()}${percentOwned > 1 ? ` (${percentOwned.toFixed(1)}%)` : ""}`;
  }

  if (selected.role) {
    embed.addField("role", `\`${selected.role}${selected.role == "car" ? ` (${selected.speed})` : ""}\``, true);
  }

  const rarityMap = new Map<number, string>();

  rarityMap.set(0, "common");
  rarityMap.set(1, "uncommon");
  rarityMap.set(2, "rare");
  rarityMap.set(3, "very rare");
  rarityMap.set(4, "exotic");

  if (rarityMap.get(selected.rarity)) {
    embed.addField("rarity", `\`${rarityMap.get(selected.rarity)}\``, true);
  }

  if (inventory.find((i) => i.item == selected.id)) {
    embed.setFooter({
      text: `you have ${inventory.find((i) => i.item == selected.id).amount.toLocaleString()} ${selected.name}${
        inventory.find((i) => i.item == selected.id).amount > 1 ? (selected.name.endsWith("s") ? "" : "s") : ""
      }`,
    });
  }

  embed.setDescription(desc);

  return await send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
