import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { countItemOnAuction, getAuctionAverage } from "../utils/functions/economy/auctions";
import { getInventory, getTotalAmountOfItem, selectItem } from "../utils/functions/economy/inventory";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("item", "view information about an item", Categories.MONEY);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option.setName("item-global").setDescription("item you want to view info for").setAutocomplete(true).setRequired(true)
);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        });
      }

      if (usedNewMessage && res instanceof Message) return res;

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

  const selected = selectItem(args.join(" ").toLowerCase());

  if (!selected) {
    return send({ embeds: [new ErrorEmbed(`couldnt find \`${args.join(" ")}\``)] });
  }

  await addCooldown(cmd.name, message.member, 7);

  const embed = new CustomEmbed(message.member).setTitle(`${selected.emoji} ${selected.name}`);

  const desc: string[] = [];

  desc.push(`\`${selected.id}\``);
  desc.push(`\n> ${selected.longDesc}\n`);

  if (selected.booster_desc) {
    desc.push(`*${selected.booster_desc}*`);
  }

  if (!selected.in_crates) {
    desc.push("*cannot be found in crates*");
  }

  if (selected.buy) {
    if (desc[desc.length - 1].endsWith("\n")) {
      desc.push(`**buy** $${selected.buy.toLocaleString()}`);
    } else {
      desc.push(`\n**buy** $${selected.buy.toLocaleString()}`);
    }
  }

  if (selected.sell) {
    if (selected.buy) {
      desc.push(`**sell** $${selected.sell.toLocaleString()}`);
    } else {
      desc.push(`\n**sell** $${selected.sell.toLocaleString()}`);
    }
  }

  const avg = await getAuctionAverage(selected.id);
  const total = await getTotalAmountOfItem(selected.id);
  const inventory = await getInventory(message.member);
  const inAuction = await countItemOnAuction(selected.id);

  if (avg) {
    if (selected.sell || selected.buy) {
      desc.push(`**average auction sale** $${Math.floor(avg).toLocaleString()}`);
    } else {
      desc.push(`\n**average auction sale** $${Math.floor(avg).toLocaleString()}`);
    }
  }

  if (total) {
    if (avg || selected.sell || selected.buy) {
      desc.push(`**in world** ${total.toLocaleString()}`);
    } else {
      desc.push(`\n**in world** ${total.toLocaleString()}`);
    }
  }

  if (inAuction) {
    if (total || avg || selected.sell || selected.buy) {
      desc.push(`**in auction** ${inAuction.toLocaleString()}`);
    } else {
      desc.push(`\n**in auction** ${inAuction.toLocaleString()}`);
    }
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
  rarityMap.set(5, "impossible");

  if (rarityMap.get(selected.rarity)) {
    embed.addField("rarity", `\`${rarityMap.get(selected.rarity)}\``, true);
  }

  if (inventory.find((i) => i.item == selected.id)) {
    embed.setFooter({
      text: `you have ${inventory.find((i) => i.item == selected.id).amount.toLocaleString()} ${
        inventory.find((i) => i.item == selected.id).amount > 1 ? selected.plural || selected.name : selected.name
      }`,
    });
  }

  embed.setDescription(desc.join("\n"));

  return await send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
