import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
  MessageEditOptions,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getBalance, updateBalance } from "../utils/functions/economy/balance";
import { addStat } from "../utils/functions/economy/stats";
import {
  createUser,
  formatNumber,
  isEcoBanned,
  userExists,
} from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getMember } from "../utils/functions/member";
import { isPremium } from "../utils/functions/premium/premium";
import { addToNypsiBank, getTax } from "../utils/functions/tax";
import { getDmSettings } from "../utils/functions/users/notifications";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { transaction } from "../utils/logger";
import dayjs = require("dayjs");

const cmd = new Command("pay", "give other users money", "money");

cmd.slashEnabled = true;
cmd.slashData
  .addUserOption((option) =>
    option.setName("user").setDescription("who would you like to send money to").setRequired(true),
  )
  .addStringOption((option) =>
    option.setName("amount").setDescription("how much would you like to send").setRequired(true),
  );

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
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

    return message.channel.send({ embeds: [embed] });
  }

  const prefix = await getPrefix(message.guild);

  if (args.length < 2) {
    const embed = new CustomEmbed(message.member)
      .setHeader("pay help")
      .addField("usage", `${prefix}pay <user> <amount>`);

    return send({ embeds: [embed] });
  }

  const target = await getMember(message.guild, args[0]);

  if (!target) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if (message.member == target) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if (target.user.bot && target.user.id != message.client.user.id) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if (await isEcoBanned(target.user.id)) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if (!(await userExists(target))) await createUser(target);

  if (!(await userExists(message.member))) await createUser(message.member);

  if (message.author.createdTimestamp > dayjs().subtract(1, "hour").unix() * 1000) {
    return message.channel.send({
      embeds: [new ErrorEmbed("you cannot use this command yet. u might be an alt. or a bot 😳")],
    });
  }

  if (args[1].toLowerCase() == "all") {
    args[1] = (await getBalance(message.member)).toString();
  } else if (args[1].toLowerCase() == "half") {
    args[1] = ((await getBalance(message.member)) / 2).toString();
  }

  const amount = formatNumber(args[1]);

  if (!amount) {
    return send({ embeds: [new ErrorEmbed("invalid payment")] });
  }

  if (amount > (await getBalance(message.member))) {
    return send({ embeds: [new ErrorEmbed("you cannot afford this payment")] });
  }

  if (amount <= 0) {
    return send({ embeds: [new ErrorEmbed("invalid payment")] });
  }

  if (target.user.id == message.client.user.id) {
    await updateBalance(message.member, (await getBalance(message.member)) - amount);
    addStat(message.author.id, "spent-bank", amount);
    await addToNypsiBank(amount);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `thank you for your donation of $${amount.toLocaleString()} 🙂`,
        ),
      ],
    });
  }

  await addCooldown(cmd.name, message.member, 15);

  let tax = await getTax();

  if ((await isPremium(message.member)) || (await isPremium(target))) {
    tax = 0;
  }

  await updateBalance(message.member, (await getBalance(message.member)) - amount);
  addStat(message.author.id, "spent-pay", amount);

  let taxedAmount = 0;

  if (tax > 0) {
    taxedAmount = Math.floor(amount * tax);
    await addToNypsiBank(taxedAmount * 0.5);
    await updateBalance(target, (await getBalance(target)) + (amount - taxedAmount));
    addStat(target.user.id, "earned-pay", amount - taxedAmount);
  } else {
    await updateBalance(target, (await getBalance(target)) + amount);
    addStat(target.user.id, "earned-pay", amount);
  }

  if ((await getDmSettings(target)).payment) {
    const embed = new CustomEmbed(
      target,
      `**${message.author.username}** has sent you $**${Math.floor(
        amount - taxedAmount,
      ).toLocaleString()}**`,
    )
      .setHeader("you have received a payment")
      .setFooter({ text: "/settings me notifications" });

    await target
      .send({
        embeds: [embed],
        content: `you have received $${Math.floor(amount - taxedAmount).toLocaleString()}`,
      })
      .catch(() => {});
  }

  const embed = new CustomEmbed(message.member)
    .setHeader("payment", message.author.avatarURL())
    .addField(
      message.author.username,
      "$" +
        ((await getBalance(message.member)) + amount).toLocaleString() +
        "\n**-** $" +
        amount.toLocaleString(),
    );

  if (tax > 0) {
    embed.setDescription(
      message.author.toString() +
        " -> " +
        target.user.toString() +
        "\n**" +
        (tax * 100).toFixed(1) +
        "**% tax",
    );
    embed.addField(
      target.user.username,
      "$" +
        ((await getBalance(target)) - amount).toLocaleString() +
        "\n**+** $" +
        (amount - Math.round(amount * tax)).toLocaleString(),
    );
  } else {
    embed.setDescription(message.author.toString() + " -> " + target.user.toString());
    embed.addField(
      target.user.username,
      "$" +
        ((await getBalance(target)) - amount).toLocaleString() +
        "\n**+** $" +
        amount.toLocaleString(),
    );
  }

  const edit = async (data: MessageEditOptions, msg: Message) => {
    if (!(message instanceof Message)) {
      await message.editReply(data);
      return await message.fetchReply();
    } else {
      return await msg.edit(data);
    }
  };

  send({ embeds: [embed] }).then(async (m) => {
    const embed = new CustomEmbed(message.member)
      .setHeader("payment", message.author.avatarURL())
      .setDescription(message.author.toString() + " -> " + target.user.toString())
      .addField(message.author.username, "$" + (await getBalance(message.member)).toLocaleString());

    if (tax > 0) {
      embed.addField(
        target.user.username,
        "$" +
          (await getBalance(target)).toLocaleString() +
          " (+$**" +
          (amount - Math.round(amount * tax)).toLocaleString() +
          "**)",
      );
      embed.setDescription(
        message.author.toString() +
          " -> " +
          target.user.toString() +
          "\n**" +
          (tax * 100).toFixed(1) +
          "**% tax",
      );
    } else {
      embed.addField(
        target.user.username,
        "$" +
          (await getBalance(target)).toLocaleString() +
          " (+$**" +
          amount.toLocaleString() +
          "**)",
      );
    }

    setTimeout(() => {
      edit({ embeds: [embed] }, m);
    }, 1500);
  });

  transaction(message.author, target.user, `$${amount.toLocaleString()}`);
}

cmd.setRun(run);

module.exports = cmd;
