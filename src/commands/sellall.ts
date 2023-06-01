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
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { getBalance, getSellMulti, updateBalance } from "../utils/functions/economy/balance";
import { addInventoryItem, getInventory, setInventoryItem } from "../utils/functions/economy/inventory";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import PageManager from "../utils/functions/page";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { percentChance } from "../utils/functions/random";
import { addToNypsiBank, getTax } from "../utils/functions/tax";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import pAll = require("p-all");

const cmd = new Command("sellall", "sell all commonly sold items", "money");

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (!(await userExists(message.member))) await createUser(message.member);

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

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
  }

  const items = getItems();

  const inventory = await getInventory(message.member);

  const selected = new Map<string, number>();

  for (const item of inventory) {
    if (items[item.item].role == "fish" || items[item.item].role == "prey" || items[item.item].role == "sellable") {
      if (items[item.item].id == "cookie" || items[item.item].id == "cake") continue;
      selected.set(item.item, inventory.find((i) => i.item == item.item).amount);
    }
  }

  if (selected.size == 0) {
    return send({ embeds: [new ErrorEmbed("you do not have anything to sell")] });
  }

  await addCooldown(cmd.name, message.member, 30);

  const multi = await getSellMulti(message.member);

  let total = 0;
  let totalSold = 0;
  let taxedAmount = 0;

  const tax = await getTax();
  let taxEnabled = true;

  if ((await isPremium(message.member)) && (await getTier(message.member)) == 4) taxEnabled = false;

  const functions = [];
  const desc: string[] = [];
  const amounts = new Map<string, number>();

  for (const item of selected.keys()) {
    functions.push(async () => {
      await setInventoryItem(message.member, item, 0, false);
    });

    let sellWorth = Math.floor(items[item].sell * selected.get(item));

    if (items[item].role == "fish" || items[item].role == "prey" || items[item].role == "sellable") {
      sellWorth = Math.floor(sellWorth + sellWorth * multi);
    }

    if (["bitcoin", "ethereum"].includes(item)) sellWorth = Math.floor(sellWorth - sellWorth * 0.05);

    if (taxEnabled) {
      taxedAmount += Math.floor(sellWorth * tax);
      sellWorth = sellWorth - Math.floor(sellWorth * tax);
    }

    total += sellWorth;
    totalSold = selected.get(item);

    desc.push(
      `\`${selected.get(item).toLocaleString()}x\` ${items[item].emoji} ${items[item].name} ($${sellWorth.toLocaleString()})`
    );
    amounts.set(
      `\`${selected.get(item).toLocaleString()}x\` ${items[item].emoji} ${
        items[item].name
      } ($${sellWorth.toLocaleString()})`,
      sellWorth
    );
  }

  functions.push(async () => {
    await addToNypsiBank(taxedAmount);
  });
  functions.push(async () => {
    await updateBalance(message.member, (await getBalance(message.member)) + total);
  });

  await pAll(functions, { concurrency: 5 });

  inPlaceSort(desc).desc((i) => amounts.get(i));

  const embed = new CustomEmbed(message.member);

  embed.setDescription(`+$**${total.toLocaleString()}**`);

  const footer: string[] = [];

  if (taxEnabled) footer.push(`${((await getTax()) * 100).toFixed(1)}% tax`);
  if (multi > 0) footer.push(`${Math.floor(multi * 100)}% bonus`);
  if (footer.length > 0) embed.setFooter({ text: footer.join(" | ") });

  const pages = PageManager.createPages(desc, 10);

  if (percentChance(totalSold * Constants.LUCKY_CHEESE_CHANCE)) {
    await addInventoryItem(message.member, "lucky_cheese", 1, false);
    pages.get(1).push("\n you found a 🧀 **lucky cheese**!");
  }

  embed.addField("items sold", pages.get(1).join("\n"));

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
  );
  if (pages.size == 1) return send({ embeds: [embed] });
  const msg = await send({ embeds: [embed], components: [row] });

  const manager = new PageManager({
    embed,
    message: msg,
    row,
    userId: message.author.id,
    pages,
    updateEmbed(page, embed) {
      embed.data.fields.length = 0;
      embed.addField("items sold", page.join("\n"));

      return embed;
    },
  });

  return manager.listen();
}

cmd.setRun(run);

module.exports = cmd;
