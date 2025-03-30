import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { addBalance, getSellMulti } from "../utils/functions/economy/balance";
import {
  getInventory,
  getSellFilter,
  selectItem,
  setInventoryItem,
  setSellFilter,
} from "../utils/functions/economy/inventory";
import { addStat } from "../utils/functions/economy/stats";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import PageManager from "../utils/functions/page";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { addToNypsiBank, getTax } from "../utils/functions/tax";
import { addCooldown, addExpiry, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import pAll = require("p-all");

const cmd = new Command("sell", "sell items", "money");

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((item) =>
    item
      .setName("item")
      .setDescription("sell a specific item")
      .addStringOption((option) =>
        option
          .setName("item")
          .setRequired(true)
          .setAutocomplete(true)
          .setDescription("item you want to sell"),
      )
      .addStringOption((option) =>
        option.setName("amount").setDescription("amount you want to sell"),
      ),
  )
  .addSubcommand((all) =>
    all.setName("all").setDescription("sell all your sellable item not in the sell filter"),
  )
  .addSubcommand((filter) =>
    filter
      .setName("filter")
      .setDescription("modify your filter for sell all")
      .addStringOption((item) =>
        item.setName("item-global").setDescription("item to add/remove from the filter"),
      ),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);

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

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  if (args.length == 0) {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          "sell items from your inventory\n\nyou may have to pay tax on your sold items",
        ),
      ],
    });
  } else if (args[0].toLowerCase() === "all") {
    const values = await calcValues(message);

    if (values.selected.size == 0) {
      return send({ embeds: [new ErrorEmbed("you do not have anything to sell")] });
    }

    const embed = new CustomEmbed(message.member, "are you sure you want to sell all?");

    const { desc, amounts, total } = values;
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

    await addCooldown(cmd.name, message.member, 900);

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
    });

    addExpiry(cmd.name, message.member, 10);

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
        await addToNypsiBank(taxedAmount * 0.7);
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
  } else if (args[0].toLowerCase() === "filter") {
    let current = await getSellFilter(message.member);
    let max = 7;

    if (await isPremium(message.member)) max *= await getTier(message.member);

    if (current.length > max) current = await setSellFilter(message.member, current.splice(0, max));

    if (args.length == 1) {
      if (current.length == 0) {
        return send({
          embeds: [new CustomEmbed(message.member, "there is nothing in the filter")],
        });
      }

      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            `sell filter: \n\n${current
              .map((i) => `${getItems()[i].emoji} ${getItems()[i].name}`)
              .join("\n")}`,
          ).setHeader("sell", message.author.avatarURL()),
        ],
      });
    }

    const searchTag = args[1].toLowerCase();

    if (searchTag == "clear") {
      if (current.length == 0)
        return send({
          embeds: [new ErrorEmbed(`you dont have anything being automatically sold`)],
        });

      await setSellFilter(message.member, []);
      return send({
        embeds: [
          new CustomEmbed(message.member, "✅ cleared sell filter").setHeader(
            "sell",
            message.author.avatarURL(),
          ),
        ],
      });
    }

    const selected = selectItem(searchTag);

    if (!selected) {
      return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[1]}\``)] });
    }

    let desc = "";

    if (current.includes(selected.id)) {
      desc = `✅ removed ${selected.emoji} ${selected.name}`;

      current.splice(current.indexOf(selected.id), 1);

      current = await setSellFilter(message.member, current);
    } else {
      if (current.length >= max) {
        let desc = `you have reached the limit of your sell filter (**${max}**)`;

        if (max == 1) {
          desc += "\n\nyou can upgrade this with premium membership (`/premium`)";
        }

        return send({ embeds: [new ErrorEmbed(desc)] });
      }

      desc = `✅ added ${selected.emoji} ${selected.name}`;

      current.push(selected.id);

      current = await setSellFilter(message.member, current);
    }

    const embed = new CustomEmbed(message.member, desc).setHeader(
      "sell",
      message.author.avatarURL(),
    );

    if (current.length > 0) {
      embed.addField(
        "sell filter",
        current.map((i) => `${getItems()[i].emoji} ${getItems()[i].name}`).join("\n"),
      );
    }

    return send({ embeds: [embed] });
  } else {
    const inventory = await getInventory(message.member);

    if (args[0].toLowerCase() === "item") args.shift();

    const selected = selectItem(args[0].toLowerCase());

    if (!selected) {
      return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] });
    }

    let amount = 1;

    if (args.length != 1) {
      if (args[1].toLowerCase() == "all") {
        args[1] = (inventory.find((i) => i.item == selected.id)?.amount || 0).toString();
      } else if (isNaN(parseInt(args[1])) || parseInt(args[1]) <= 0) {
        return send({ embeds: [new ErrorEmbed("invalid amount")] });
      }
      amount = parseInt(args[1]);
    }

    if (!parseInt(amount.toString())) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (amount < 1) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (!amount) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (
      !inventory.find((i) => i.item == selected.id) ||
      inventory.find((i) => i.item == selected.id).amount == 0
    ) {
      return send({ embeds: [new ErrorEmbed("you dont have any " + selected.name)] });
    }

    if (amount > inventory.find((i) => i.item == selected.id).amount) {
      return send({ embeds: [new ErrorEmbed(`you don't have enough ${selected.name}`)] });
    }

    await addCooldown(cmd.name, message.member, 5);

    await setInventoryItem(
      message.member,
      selected.id,
      inventory.find((i) => i.item == selected.id).amount - amount,
    );

    let sellWorth = Math.floor(selected.sell * amount);

    const multi = (await getSellMulti(message.member)).multi;

    if (selected.role == "fish" || selected.role == "prey" || selected.role == "sellable") {
      sellWorth = Math.floor(sellWorth + sellWorth * multi);
    } else if (!selected.sell) {
      sellWorth = 1000 * amount;
    }

    let tax = true;

    if ((await isPremium(message.member)) && (await getTier(message.member)) == 4) tax = false;
    if (["bitcoin", "ethereum"].includes(selected.id)) tax = false;

    if (tax) {
      const taxedAmount = Math.floor(sellWorth * (await getTax()));

      sellWorth = sellWorth - taxedAmount;
    }

    await addBalance(message.member, sellWorth);

    addStat(message.author.id, "earned-sold", sellWorth);

    const embed = new CustomEmbed(message.member);

    embed.setDescription(
      `you sold **${amount.toLocaleString()}** ${selected.emoji} ${
        selected.name
      } for $${sellWorth.toLocaleString()} ${
        multi > 0 &&
        (selected.role == "fish" || selected.role == "prey" || selected.role == "sellable")
          ? `(+**${Math.floor(multi * 100).toString()}**% bonus)`
          : ""
      }`,
    );

    if (tax) embed.setFooter({ text: `${((await getTax()) * 100).toFixed(1)}% tax` });

    return send({ embeds: [embed] });
  }
}

async function calcValues(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  const items = getItems();

  const [inventory, filter] = await Promise.all([
    getInventory(message.member),
    getSellFilter(message.member),
  ]);

  const selected = new Map<string, number>();

  for (const item of inventory.filter((i) => !filter.includes(i.item))) {
    if (
      items[item.item].role == "fish" ||
      items[item.item].role == "prey" ||
      items[item.item].role == "sellable"
    ) {
      if (items[item.item].id == "cookie" || items[item.item].id == "cake") continue;
      selected.set(item.item, inventory.find((i) => i.item == item.item).amount);
    }
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
    let sellWorth = Math.floor(items[item].sell * selected.get(item));

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
