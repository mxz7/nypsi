import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageEditOptions,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import {
  addBalance,
  getBankBalance,
  getMaxBankBalance,
  removeBankBalance,
} from "../utils/functions/economy/balance.js";
import { createUser, formatNumber, userExists } from "../utils/functions/economy/utils.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";

const cmd = new Command("withdraw", "withdraw money from your bank", "money").setAliases(["with"]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option.setName("amount").setDescription("amount to withdraw").setRequired(true),
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

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member)
      .setHeader("withdraw help")
      .addField("usage", `${prefix}withdraw <amount>`)
      .addField(
        "help",
        "you can withdraw money from your bank as long as you have that amount available in your bank",
      );
    return send({ embeds: [embed] });
  }

  if ((await getBankBalance(message.member)) == 0) {
    return send({ embeds: [new ErrorEmbed("you dont have any money in your bank account")] });
  }

  if (args[0].toLowerCase() == "all") {
    args[0] = (await getBankBalance(message.member)).toString();
  }

  if (args[0] == "half") {
    args[0] = ((await getBankBalance(message.member)) / 2).toString();
  }

  const amount = formatNumber(args[0]);

  if (amount > (await getBankBalance(message.member))) {
    return send({
      embeds: [new ErrorEmbed("you dont have enough money in your bank account")],
    });
  }

  if (!amount) {
    return send({ embeds: [new ErrorEmbed("invalid payment")] });
  }

  if (amount <= 0) {
    return send({ embeds: [new ErrorEmbed("invalid payment")] });
  }

  await addCooldown(cmd.name, message.member, 5);

  const embed = new CustomEmbed(message.member)
    .setHeader("bank withdrawal", message.author.avatarURL())
    .addField(
      "bank balance",
      "$**" +
        (await getBankBalance(message.member)).toLocaleString() +
        "** / $**" +
        (await getMaxBankBalance(message.member)).toLocaleString() +
        "**",
    )
    .addField("transaction amount", "-$**" + amount.toLocaleString() + "**");

  const m = await send({ embeds: [embed] });

  await removeBankBalance(message.member, amount);
  await addBalance(message.member, amount);

  const embed1 = new CustomEmbed(message.member)
    .setHeader("bank withdrawal", message.author.avatarURL())
    .addField(
      "bank balance",
      "$**" +
        (await getBankBalance(message.member)).toLocaleString() +
        "** / $**" +
        (await getMaxBankBalance(message.member)).toLocaleString() +
        "**",
    );

  embed1.addField("transaction amount", "-$**" + amount.toLocaleString() + "**");

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
