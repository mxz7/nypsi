import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";

import { sort } from "fast-sort";
import prisma from "../init/database";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { countItemOnAuction, findAuctions } from "../utils/functions/economy/auctions";
import {
  calcItemValue,
  getInventory,
  getTotalAmountOfItem,
  selectItem,
} from "../utils/functions/economy/inventory";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { getEmojiImage } from "../utils/functions/image";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("item", "view information about an item", "money").setAliases(["i"]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option
    .setName("item-global")
    .setDescription("item you want to view info for")
    .setAutocomplete(true)
    .setRequired(true),
);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data as InteractionEditReplyOptions).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data as InteractionEditReplyOptions).catch(async () => {
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
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  if (args.length == 0) {
    return send({ embeds: [new ErrorEmbed("/item <item>")] });
  }

  const selected = selectItem(args.join(" ").toLowerCase());

  if (!selected) {
    return send({ embeds: [new ErrorEmbed(`couldnt find \`${args.join(" ")}\``)] });
  }

  await addCooldown(cmd.name, message.member, 4);

  const embed = new CustomEmbed(message.member).setTitle(`${selected.emoji} ${selected.name}`);

  const desc: string[] = [];

  desc.push(`[\`${selected.id}\`](https://nypsi.xyz/item/${selected.id})`);
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

  const [total, inventory, inAuction, value] = await Promise.all([
    getTotalAmountOfItem(selected.id),
    getInventory(message.member),
    countItemOnAuction(selected.id),
    calcItemValue(selected.id),
  ]);

  if (selected.sell || selected.buy) {
    desc.push(
      `**worth** ${value ? `$${Math.floor(value).toLocaleString()}` : "[unvalued](https://nypsi.xyz/docs/economy/items/worth#unvalued"}`,
    );
  } else {
    desc.push(
      `\n**worth** ${value ? `$${Math.floor(value).toLocaleString()}` : "[unvalued](https://nypsi.xyz/docs/economy/items/worth#unvalued"}`,
    );
  }

  if (total && selected.id !== "lottery_ticket") {
    desc.push(`\n**in world** ${total.toLocaleString()}`);
  }

  if (inAuction) {
    const auctions = await findAuctions(selected.id);
    let cheapest: number;

    if (auctions.length > 0) {
      const cheapestItem = sort(auctions).asc((a) => a.bin / a.itemAmount)[0];

      cheapest = Math.floor(Number(cheapestItem.bin / cheapestItem.itemAmount));
    }

    if (total) {
      desc.push(
        `**in auction** ${inAuction.toLocaleString()}${cheapest ? ` ($${cheapest.toLocaleString()})` : ""}`,
      );
    } else {
      desc.push(
        `\n**in auction** ${inAuction.toLocaleString()}${cheapest ? ` ($${cheapest.toLocaleString()})` : ""}`,
      );
    }
  }

  if (selected.role) {
    embed.addField(
      "role",
      `\`${selected.role}${selected.role == "car" ? ` (${selected.speed})` : ""}\``,
      true,
    );
  }

  const rarityMap = new Map<number, string>();

  rarityMap.set(0, "common");
  rarityMap.set(1, "uncommon");
  rarityMap.set(2, "rare");
  rarityMap.set(3, "very rare");
  rarityMap.set(4, "exotic");
  rarityMap.set(5, "impossible");
  rarityMap.set(6, "literally not possible within your lifetime");

  if (rarityMap.get(selected.rarity)) {
    embed.addField("rarity", `\`${rarityMap.get(selected.rarity)}\``, true);
  }

  if (inventory.find((i) => i.item == selected.id)) {
    embed.setFooter({
      text: `you have ${inventory.find((i) => i.item == selected.id).amount.toLocaleString()} ${
        inventory.find((i) => i.item == selected.id).amount > 1
          ? selected.plural || selected.name
          : selected.name
      }`,
    });
  }

  embed.setDescription(desc.join("\n"));

  const thumbnail = getEmojiImage(selected.emoji);

  embed.setThumbnail(thumbnail);
  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    new ActionRowBuilder<MessageActionRowComponentBuilder>(),
  ];

  if (total > 0)
    components[0].addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("leaderboard")
        .setEmoji("🏆")
        .setURL(`https://nypsi.xyz/leaderboard/${selected.id}`),
    );

  if (
    !(
      (await prisma.auction.count({ where: { AND: [{ itemId: selected.id }, { sold: true }] } })) <
        5 &&
      (await prisma.offer.count({ where: { AND: [{ itemId: selected.id }, { sold: true }] } })) <
        5 &&
      (await prisma.graphMetrics.count({ where: { category: `item-count-${selected.id}` } })) < 5
    )
  ) {
    components[0].addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("history")
        .setEmoji("📈")
        .setURL("https://nypsi.xyz/item/history/" + selected.id),
    );
  }

  return await send({
    embeds: [embed],
    components: components[0].components.length > 0 ? components : null,
  });
}

cmd.setRun(run);

module.exports = cmd;
