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
import { inPlaceSort } from "fast-sort";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import PageManager from "../../page";
import { getTier, isPremium } from "../../premium/premium";
import sleep from "../../sleep";
import { addProgress } from "../achievements";
import { calcItemValue, getInventory, openCrate, selectItem } from "../inventory";
import { addStat } from "../stats";
import { addTaskProgress } from "../tasks";
import { getItems } from "../utils";

module.exports = new ItemUse(
  "crates",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    args: string[],
  ) => {
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

    const inventory = await getInventory(message.member);

    const selected = selectItem(args[0].toLowerCase());

    if (!selected || typeof selected == "string") {
      return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] });
    }

    if (
      !inventory.find((i) => i.item == selected.id) ||
      inventory.find((i) => i.item == selected.id).amount == 0
    ) {
      return send({
        embeds: [new ErrorEmbed(`you dont have ${selected.article} ${selected.name}`)],
      });
    }

    let amount = 1;

    if (args[1]?.toLowerCase() === "all") {
      amount = inventory.find((i) => i.item === selected.id).amount;
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

    if (amount > (inventory.find((i) => i.item === selected.id)?.amount || 0))
      return send({ embeds: [new ErrorEmbed(`you don't have ${amount} ${selected.name}`)] });

    const embed = new CustomEmbed(
      message.member,
      `opening **${amount}** ${
        amount > 1 ? (selected.plural ? selected.plural : selected.name) : selected.name
      }`,
    ).setHeader(
      `${message.author.username}'s ${amount} ${
        amount > 1 ? (selected.plural ? selected.plural : selected.name) : selected.name
      }`,
      message.author.avatarURL(),
    );

    const msg = await send({ embeds: [embed] });

    const foundItems = new Map<string, number>();

    await Promise.all([
      addProgress(message.author.id, "unboxer", amount),
      addStat(message.author.id, selected.id, amount),
      addTaskProgress(message.author.id, "open_crates", amount),
    ]);

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

    const values = new Map<string, number>();

    for (const [item, amount] of foundItems.entries()) {
      values.set(item, ((await calcItemValue(item).catch(() => 0)) || 0) * amount);
    }

    for (const [item, amount] of inPlaceSort(Array.from(foundItems.entries())).desc([
      (i) => values.get(i[0]),
      (i) => i[1],
    ])) {
      desc.push(`- \`${amount}x\` ${getItems()[item].emoji} ${getItems()[item].name}`);
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
