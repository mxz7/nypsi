import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
  MessageEditOptions,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import {
  getBalance,
  getBankBalance,
  getMaxBankBalance,
  removeBalance,
  updateBankBalance,
} from "../utils/functions/economy/balance.js";
import { createUser, formatNumber, userExists } from "../utils/functions/economy/utils.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";

const cmd = new Command("deposit", "deposit money into your bank", "money").setAliases(["dep"]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option.setName("amount").setDescription("amount to deposit").setRequired(true),
);

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

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member)
      .setHeader("deposit help")
      .addField("usage", `${prefix}deposit <amount>`)
      .addField(
        "help",
        "you can deposit money into your bank to keep it safe from robberies (and gambling if you have *issues*)\n" +
          "however there is a limit to the size of your bank account, when starting, your bank has a capacity of $**15,000**, but will upgrade as you use the bot more.",
      );
    return send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "all") {
    args[0] = (await getBalance(message.member)).toString();
    const amount = parseInt(args[0]);
    if (
      amount >
      (await getMaxBankBalance(message.member)) - (await getBankBalance(message.member))
    ) {
      args[0] = (
        (await getMaxBankBalance(message.member)) - (await getBankBalance(message.member))
      ).toString();
    }
  }

  if (args[0] == "half") {
    args[0] = ((await getBankBalance(message.member)) / 2).toString();
  }

  const amount = formatNumber(args[0]);

  if (!amount || isNaN(amount)) {
    return send({ embeds: [new ErrorEmbed("invalid amount")] });
  }

  if (amount > (await getBalance(message.member))) {
    return send({ embeds: [new ErrorEmbed("you cannot afford this payment")] });
  }

  if (amount > (await getMaxBankBalance(message.member)) - (await getBankBalance(message.member))) {
    return send({ embeds: [new ErrorEmbed("your bank is not big enough for this payment")] });
  }

  if (amount <= 0) {
    return send({ embeds: [new ErrorEmbed("invalid payment")] });
  }

  await addCooldown(cmd.name, message.member, 30);

  const embed = new CustomEmbed(message.member)
    .setHeader("bank deposit", message.author.avatarURL())
    .addField(
      "bank balance",
      "$**" +
        (await getBankBalance(message.member)).toLocaleString() +
        "** / $**" +
        (await getMaxBankBalance(message.member)).toLocaleString() +
        "**",
    )
    .addField("transaction amount", "+$**" + amount.toLocaleString() + "**");

  const m = await send({ embeds: [embed] });

  await removeBalance(message.member, amount);
  await updateBankBalance(message.member, (await getBankBalance(message.member)) + amount);

  const embed1 = new CustomEmbed(message.member)
    .setHeader("bank deposit", message.author.avatarURL())
    .addField(
      "bank balance",
      "$**" +
        (await getBankBalance(message.member)).toLocaleString() +
        "** / $**" +
        (await getMaxBankBalance(message.member)).toLocaleString() +
        "**",
    )
    .addField("transaction amount", "+$**" + amount.toLocaleString() + "**");

  const edit = async (data: MessageEditOptions, msg: Message) => {
    if (!(message instanceof Message)) {
      await message.editReply(data);
      return await message.fetchReply();
    } else {
      return await msg.edit(data);
    }
  };

  setTimeout(() => edit({ embeds: [embed1] }, m), 1500);
}

cmd.setRun(run);

module.exports = cmd;
