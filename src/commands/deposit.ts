import {
  CommandInteraction,
  InteractionEditReplyOptions,
  Message,
  MessageEditOptions,
  MessageFlags,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import {
  addBankBalance,
  getBalance,
  getBankBalance,
  getMaxBankBalance,
  removeBalance,
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
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
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

  await addCooldown(cmd.name, message.member, 5);

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
  await addBankBalance(message.member, amount);

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
      await message.editReply(data as InteractionEditReplyOptions);
      return await message.fetchReply();
    } else {
      return await msg.edit(data);
    }
  };

  setTimeout(() => edit({ embeds: [embed1] }, m), 1500);
}

cmd.setRun(run);

module.exports = cmd;
