import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import PageManager from "../../page";
import { getTier, isPremium } from "../../premium/premium";
import sleep from "../../sleep";
import { pluralize } from "../../string";
import { addProgress } from "../achievements";
import { calcItemValue, getInventory, selectItem } from "../inventory";
import { openCrate } from "../loot_pools";
import { addStat } from "../stats";
import { addTaskProgress } from "../tasks";
import { getItems } from "../utils";

module.exports = new ItemUse(
  "crates",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    args: string[],
  ) => {
    const inventory = await getInventory(message.member);

    const selected = selectItem(args[0].toLowerCase());

    if (!selected || typeof selected == "string") {
      return ItemUse.send(message, { embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] });
    }

    if (!inventory.has(selected.id)) {
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed(`you dont have ${selected.article} ${selected.name}`)],
      });
    }

    let amount = 1;

    if (args[1]?.toLowerCase() === "all") {
      amount = inventory.count(selected.id);
    } else if (parseInt(args[1])) {
      amount = parseInt(args[1]);
    }

    let max = 10;

    if (await isPremium(message.member)) {
      max = 20;
      if ((await getTier(message.member)) >= 3) {
        max = 50;
      }
    }

    if (amount > max) amount = max;

    if (inventory.count(selected.id) < amount)
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed(`you don't have ${amount} ${selected.name}`)],
      });

    const embed = new CustomEmbed(
      message.member,
      `opening **${amount}** ${pluralize(selected, amount)}`,
    ).setHeader(
      `${message.author.username}'s ${amount} ${pluralize(selected, amount)}`,
      message.author.avatarURL(),
    );

    const msg = await ItemUse.send(message, { embeds: [embed] });

    const foundAll = {
      money: 0,
      xp: 0,
      karma: 0,
      items: {},
    } as {
      money: number;
      xp: number;
      karma: number;
      items: {
        [item: string]: number;
      };
    };

    await Promise.all([
      addProgress(message.author.id, "unboxer", amount),
      addStat(message.author.id, selected.id, amount),
      addTaskProgress(message.author.id, "open_crates", amount),
    ]);

    for (let i = 0; i < amount; i++) {
      const found = await openCrate(message.member, selected);
      for (const product of found) {
        foundAll.money += product.money ?? 0;
        foundAll.xp += product.xp ?? 0;
        foundAll.karma += product.karma ?? 0;
        if (Object.hasOwn(product, "item")) {
          if (Object.hasOwn(foundAll.items, product.item)) {
            foundAll.items[product.item] += product.count ?? 1;
          } else {
            foundAll.items[product.item] = product.count ?? 1;
          }
        }
      }
    }

    const desc: string[] = [];

    desc.push("you found: ");

    if (foundAll.money > 0) {
      desc.push(`- $${foundAll.money.toLocaleString()}`);
    }

    if (foundAll.xp > 0 || foundAll.karma > 0) {
      const xpText = foundAll.xp > 0 ? `+${foundAll.xp.toLocaleString()}xp` : "";
      const karmaText = foundAll.karma > 0 ? `+${foundAll.karma.toLocaleString()}🔮` : "";
      const joiner = foundAll.xp > 0 && foundAll.karma > 0 ? "    " : "";
      embed.setFooter({ text: `${xpText}${joiner}${karmaText}` });
    }

    const values = new Map<string, number>();
    const items = Object.keys(foundAll.items);

    for (const itemKey in foundAll.items) {
      values.set(
        itemKey,
        ((await calcItemValue(itemKey).catch(() => 0)) || 0) * foundAll.items[itemKey],
      );
    }
    inPlaceSort(items).desc((i) => values.get(i));

    for (const item of items) {
      desc.push(
        `- \`${foundAll.items[item]}x\` ${getItems()[item].emoji} ${getItems()[item].name}`,
      );
    }

    const pages = PageManager.createPages(desc, 15);

    embed.setDescription(pages.get(1).join("\n"));

    await sleep(2500);

    if (pages.size === 1) {
      return msg.edit({ embeds: [embed] });
    } else {
      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("⬅")
          .setLabel("back")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
      );

      await msg.edit({ embeds: [embed], components: [row] });

      const manager = new PageManager({
        embed,
        message: msg,
        row,
        userId: message.author.id,
        pages,
        allowMessageDupe: true,
      });

      return manager.listen();
    }
  },
);
