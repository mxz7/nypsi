import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { addBalance, getSellMulti } from "../utils/functions/economy/balance";
import { getInventory, setInventoryItem } from "../utils/functions/economy/inventory";
import { addStat } from "../utils/functions/economy/stats";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import PageManager from "../utils/functions/page";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { addToNypsiBank, getTax } from "../utils/functions/tax";
import { addCooldown, addExpiry, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import pAll = require("p-all");

const cmd = new Command("sellinv", "sell your entire inventory", "money");

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
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  if ((await calcValues(message)).selected.size == 0) {
    return send({ embeds: [new ErrorEmbed("you do not have anything to sell")] });
  }

  await addCooldown(cmd.name, message.member, 30);

  const embed = new CustomEmbed(message.member, "are you sure you want to sell all?");

  const { desc, amounts, total } = await calcValues(message);
  inPlaceSort(desc).desc((i) => amounts.get(i));
  if (desc.length <= 10) embed.addField("items to be sold", desc.join("\n"));
  else {
    let newDesc = "";
    for (let i = 0; i < 9; i++) newDesc += `${desc[i]}\n`;
    let amount = 0;
    for (let i = 9; i < desc.length; i++)
      amount += Number(desc[i].split(" ($")[1].split(")")[0].replaceAll(",", ""));
    newDesc += `*${desc.length - 9} more ($${amount.toLocaleString()})*`;
    embed.addField("items to be sold", newDesc);
  }
  embed.setFooter({ text: `total: $${total.toLocaleString()}` });

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("✅").setLabel("confirm").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("❌").setLabel("cancel").setStyle(ButtonStyle.Danger),
  );

  const msg = await send({ embeds: [embed], components: [row] });

  const filter = (i: Interaction) => i.user.id == message.author.id;

  const reaction = await msg.awaitMessageComponent({ filter, time: 15000 }).catch(async () => {
    await msg.edit({
      embeds: [embed],
      components: [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Danger)
            .setLabel("expired")
            .setCustomId("boobies")
            .setDisabled(true),
        ),
      ],
    });
    addExpiry(cmd.name, message.member, 30);
  });

  if (!reaction) return;

  if (reaction.customId === "❌") {
    msg.edit({ components: [] });
    return reaction.reply({
      embeds: [new CustomEmbed(message.member, "✅ cancelled")],
      ephemeral: true,
    });
  }

  if (reaction.customId == "✅") {
    await reaction.deferReply({ ephemeral: true });

    const { selected, taxedAmount, desc, amounts, total, taxEnabled, multi } =
      await calcValues(message);

    if (selected.size == 0) {
      const embed = new ErrorEmbed("you do not have anything to sell");
      reaction.editReply({ embeds: [new CustomEmbed(message.member, "lol nice try")] });
      return msg
        ? msg.edit({ embeds: [embed], components: [] })
        : send({ embeds: [embed], components: [] });
    }

    const functions = [];
    for (const item of selected.keys())
      functions.push(async () => {
        await setInventoryItem(message.member, item, 0);
      });

    functions.push(async () => {
      await addToNypsiBank(taxedAmount);
    });
    functions.push(async () => {
      await addBalance(message.member, total);
    });

    addStat(message.author.id, "earned-sold", total);

    await pAll(functions, { concurrency: 5 });

    inPlaceSort(desc).desc((i) => amounts.get(i));

    const embed = new CustomEmbed(message.member);

    embed.setDescription(`+$**${total.toLocaleString()}**`);

    reaction.editReply({
      embeds: [
        new CustomEmbed(null, `+$**${total.toLocaleString()}**`).setColor(
          Constants.EMBED_SUCCESS_COLOR,
        ),
      ],
    });

    const footer: string[] = [];

    if (taxEnabled) footer.push(`${((await getTax()) * 100).toFixed(1)}% tax`);
    if (multi > 0) footer.push(`${Math.floor(multi * 100)}% bonus`);
    if (footer.length > 0) embed.setFooter({ text: footer.join(" | ") });

    const pages = PageManager.createPages(desc, 10);

    embed.addField("items sold", pages.get(1).join("\n"));

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("⬅")
        .setLabel("back")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
    );
    if (pages.size == 1)
      return msg
        ? msg.edit({ embeds: [embed], components: [] })
        : send({ embeds: [embed], components: [] });
    const m = await (msg
      ? msg.edit({ embeds: [embed], components: [row] })
      : send({ embeds: [embed], components: [row] }));

    const manager = new PageManager({
      embed,
      message: m,
      row,
      userId: message.author.id,
      allowMessageDupe: true,
      pages,
      updateEmbed(page, embed) {
        embed.data.fields.length = 0;
        embed.addField("items sold", page.join("\n"));

        return embed;
      },
    });

    return manager.listen();
  }
}

async function calcValues(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  const items = getItems();

  const inventory = await getInventory(message.member);

  const selected = new Map<string, number>();

  for (const item of inventory) {
    selected.set(item.item, inventory.find((i) => i.item == item.item).amount);
  }

  const multi = (await getSellMulti(message.member)).multi;

  let total = 0;
  let taxedAmount = 0;

  const tax = await getTax();
  let taxEnabled = true;

  if ((await isPremium(message.member)) && (await getTier(message.member)) == 4) taxEnabled = false;

  const desc: string[] = [];
  const amounts = new Map<string, number>();

  for (const item of selected.keys()) {
    let sellWorth = Math.floor((items[item].sell || 1000) * selected.get(item));

    if (
      items[item].role == "fish" ||
      items[item].role == "prey" ||
      items[item].role == "sellable"
    ) {
      sellWorth = Math.floor(sellWorth + sellWorth * multi);
    }

    if (["bitcoin", "ethereum"].includes(item))
      sellWorth = Math.floor(sellWorth - sellWorth * 0.05);

    if (taxEnabled) {
      taxedAmount += Math.floor(sellWorth * tax);
      sellWorth = sellWorth - Math.floor(sellWorth * tax);
    }

    total += sellWorth;

    desc.push(
      `\`${selected.get(item).toLocaleString()}x\` ${items[item].emoji} ${
        items[item].name
      } ($${sellWorth.toLocaleString()})`,
    );
    amounts.set(
      `\`${selected.get(item).toLocaleString()}x\` ${items[item].emoji} ${
        items[item].name
      } ($${sellWorth.toLocaleString()})`,
      sellWorth,
    );
  }

  const res = {
    selected,
    total,
    desc,
    amounts,
    taxEnabled,
    taxedAmount,
    multi,
  };

  return res;
}

cmd.setRun(run);

module.exports = cmd;
