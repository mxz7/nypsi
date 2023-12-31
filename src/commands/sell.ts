import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getBalance, getSellMulti, updateBalance } from "../utils/functions/economy/balance";
import { getInventory, selectItem, setInventoryItem } from "../utils/functions/economy/inventory";
import { addStat } from "../utils/functions/economy/stats";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { getTax } from "../utils/functions/tax";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("sell", "sell items", "money");

cmd.slashEnabled = true;
cmd.slashData
  .addStringOption((option) =>
    option
      .setName("item")
      .setRequired(true)
      .setAutocomplete(true)
      .setDescription("item you want to sell"),
  )
  .addStringOption((option) => option.setName("amount").setDescription("amount you want to sell"));

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
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

  if (args.length == 0) {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          "sell items from your inventory\n\nyou will have to pay tax on your sold items",
        ),
      ],
    });
  }

  const inventory = await getInventory(message.member);

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

  if (tax) {
    const taxedAmount = Math.floor(sellWorth * (await getTax()));

    sellWorth = sellWorth - taxedAmount;
  }

  await updateBalance(message.member, (await getBalance(message.member)) + sellWorth);

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

cmd.setRun(run);

module.exports = cmd;
