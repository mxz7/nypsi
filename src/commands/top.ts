import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message, PermissionFlagsBits } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { Item } from "../types/Economy.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js";
import { topCompletion } from "../utils/functions/economy/achievements.js";
import { topAmount } from "../utils/functions/economy/balance.js";
import { topAmountItem } from "../utils/functions/economy/inventory.js";
import { topAmountPrestige } from "../utils/functions/economy/prestige.js";
import { getItems } from "../utils/functions/economy/utils.js";

const cmd = new Command("top", "view top etc. in the server", Categories.MONEY).setAliases(["baltop", "gangsters"]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((balance) =>
    balance
      .setName("balance")
      .setDescription("view top balances in the server")
      .addIntegerOption((option) => option.setName("amount").setDescription("amount of members to show").setRequired(false))
  )
  .addSubcommand((prestige) =>
    prestige
      .setName("prestige")
      .setDescription("view top prestiges in the server")
      .addIntegerOption((option) => option.setName("amount").setDescription("amount of members to show").setRequired(false))
  )
  .addSubcommand((item) =>
    item
      .setName("item")
      .setDescription("view top item holders in the server")
      .addStringOption((option) =>
        option.setName("item-global").setDescription("item to query").setRequired(true).setAutocomplete(true)
      )
      .addIntegerOption((option) => option.setName("amount").setDescription("amount of members to show").setRequired(false))
  )
  .addSubcommand((completion) =>
    completion
      .setName("completion")
      .setDescription("view top completion in the server")
      .addIntegerOption((option) => option.setName("amount").setDescription("amount of members to show").setRequired(false))
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

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
  }

  await addCooldown(cmd.name, message.member, 15);

  const topBalance = async (amount: number) => {
    const balTop = await topAmount(message.guild, amount);

    if (balTop.length == 0) {
      return send({ embeds: [new ErrorEmbed("there are no users to show")] });
    }

    const embed = new CustomEmbed(message.member).setHeader("top " + balTop.length).setDescription(balTop.join("\n"));

    return send({ embeds: [embed] });
  };

  const topPrestige = async (amount: number) => {
    const prestigeTop = await topAmountPrestige(message.guild, amount);

    const embed = new CustomEmbed(message.member)
      .setHeader("top " + prestigeTop.length)
      .setDescription(prestigeTop.join("\n"));

    return send({ embeds: [embed] });
  };

  const topItem = async (item: Item, amount: number) => {
    const top = await topAmountItem(message.guild, amount, item.id);

    if (top.length == 0) {
      return send({ embeds: [new ErrorEmbed(`there are no users to show for ${item.name}`)] });
    }

    const embed = new CustomEmbed(message.member)
      .setHeader(`top ${top.length} ${item.name} holders`)
      .setDescription(top.join("\n"));

    return send({ embeds: [embed] });
  };

  const topComplete = async (amount: number) => {
    const top = await topCompletion(message.guild, amount);

    if (top.length == 0) {
      return send({ embeds: [new ErrorEmbed("there are no users to show")] });
    }

    const embed = new CustomEmbed(message.member).setHeader(`top ${top.length} completion`).setDescription(top.join("\n"));

    return send({ embeds: [embed] });
  };

  if (args.length == 0) {
    return topBalance(5);
  } else if (args[0].toLowerCase() == "balance") {
    let amount;

    amount = parseInt(args[1]);

    if (!amount) amount = 5;

    if (amount > 10 && !message.member.permissions.has(PermissionFlagsBits.Administrator)) amount = 10;

    if (amount < 5) amount = 5;

    return topBalance(amount);
  } else if (args[0].toLowerCase() == "prestige") {
    let amount;

    amount = parseInt(args[1]);

    if (!amount) amount = 5;

    if (amount > 10 && !message.member.permissions.has(PermissionFlagsBits.Administrator)) amount = 10;

    if (amount < 5) amount = 5;

    return topPrestige(amount);
  } else if (args[0].toLowerCase() == "item") {
    const items = getItems();
    const searchTag = args[1].toLowerCase();

    let item: Item;

    for (const itemName of Array.from(Object.keys(items))) {
      const aliases = items[itemName].aliases ? items[itemName].aliases : [];
      if (searchTag == itemName) {
        item = items[itemName];
        break;
      } else if (searchTag == itemName.split("_").join("")) {
        item = items[itemName];
        break;
      } else if (aliases.indexOf(searchTag) != -1) {
        item = items[itemName];
        break;
      } else if (searchTag == items[itemName].name) {
        item = items[itemName];
        break;
      }
    }

    if (!item) {
      return send({ embeds: [new ErrorEmbed(`couldn't find ${searchTag}`)] });
    }

    let amount;

    amount = parseInt(args[2]);

    if (!amount) amount = 5;

    if (amount > 10 && !message.member.permissions.has(PermissionFlagsBits.Administrator)) amount = 10;

    if (amount < 5) amount = 5;

    return topItem(item, amount);
  } else if (args[0].toLowerCase() == "completion") {
    let amount;

    amount = parseInt(args[1]);

    if (!amount) amount = 5;

    if (amount > 10 && !message.member.permissions.has(PermissionFlagsBits.Administrator)) amount = 10;

    if (amount < 5) amount = 5;

    return topComplete(amount);
  }
}

cmd.setRun(run);

module.exports = cmd;
