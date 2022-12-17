import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { NypsiCommandInteraction } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import PageManager from "../../page";
import { getTier, isPremium } from "../../premium/premium";
import sleep from "../../sleep";
import { getInventory, openCrate, selectItem } from "../inventory";

module.exports = new ItemUse(
  "crates",
  async (message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) => {
    const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
      if (!(message instanceof Message)) {
        if (message.deferred) {
          await message.editReply(data);
        } else {
          await message.reply(data as InteractionReplyOptions).catch(() => {
            return message.editReply(data);
          });
        }
        const replyMsg = await message.fetchReply();
        if (replyMsg instanceof Message) {
          return replyMsg;
        }
      } else {
        return await message.channel.send(data as BaseMessageOptions);
      }
    };

    const inventory = await getInventory(message.member);

    const selected = selectItem(args[0].toLowerCase());

    if (!selected || typeof selected == "string") {
      return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] });
    }

    if (!inventory.find((i) => i.item == selected.id) || inventory.find((i) => i.item == selected.id).amount == 0) {
      return send({ embeds: [new ErrorEmbed(`you dont have a ${selected.name}`)] });
    }

    let amount = 1;

    if (args[1]?.toLowerCase() === "all") {
      amount = inventory.find((i) => i.item === selected.id).amount;
    } else if (parseInt(args[1])) {
      amount = parseInt(args[1]);
    }

    let max = 5;

    if (await isPremium(message.member)) {
      if ((await getTier(message.member)) >= 3) {
        max = 50;
      } else {
        max = 20;
      }
    }

    if (amount > max) amount = max;

    const embed = new CustomEmbed(
      message.member,
      `opening **${amount}** ${amount > 1 ? (selected.plural ? selected.plural : selected.name) : selected.name}`
    ).setHeader(
      `${message.author.username}'s ${amount} ${
        amount > 1 ? (selected.plural ? selected.plural : selected.name) : selected.name
      }`,
      message.author.avatarURL()
    );

    const msg = await send({ embeds: [embed] });

    const foundItems = new Map<string, number>();

    for (let i = 0; i < amount; i++) {
      const found = await openCrate(message.member, selected);

      for (const [key, value] of found.entries()) {
        if (foundItems.has(key)) {
          foundItems.set(key, foundItems.get(key) + value);
        } else {
          foundItems.set(key, value);
        }
      }
    }

    const desc: string[] = [];

    desc.push("you found: ");

    if (foundItems.has("money")) {
      desc.push(`- $${foundItems.get("money").toLocaleString()}`);
      foundItems.delete("money");
    }

    if (foundItems.has("xp")) {
      embed.setFooter({ text: `+${foundItems.get("xp").toLocaleString()}xp` });
      foundItems.delete("xp");
    }

    for (const [item, amount] of inPlaceSort(Array.from(foundItems.entries())).desc((i) => i[1])) {
      desc.push(`- \`${amount}x\` ${item}`);
    }

    const pages = PageManager.createPages(desc, 7);

    embed.setDescription(pages.get(1).join("\n"));

    await sleep(1500);

    if (pages.size === 1) {
      return msg.edit({ embeds: [embed] });
    } else {
      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
      );

      await msg.edit({ embeds: [embed], components: [row] });

      const manager = new PageManager({
        embed,
        message: msg,
        row,
        userId: message.author.id,
        pages,
      });

      return manager.listen();
    }
  }
);
