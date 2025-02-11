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
import Constants from "../utils/Constants";
import { addBalance, getBalance, removeBalance } from "../utils/functions/economy/balance";
import { addStat } from "../utils/functions/economy/stats";
import {
  createUser,
  formatNumber,
  isEcoBanned,
  userExists,
} from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getMember } from "../utils/functions/member";
import { getTier, isPremium } from "../utils/functions/premium/premium";
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
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
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

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  const prefix = (await getPrefix(message.guild))[0];

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

  if (
    target.user.bot &&
    ![message.client.user.id, ...Constants.WHITELISTED_BOTS].includes(target.user.id)
  ) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if ((await isEcoBanned(target.user.id)).banned) {
    return send({ embeds: [new ErrorEmbed("they are banned xd")] });
  }

  if (!(await userExists(target))) await createUser(target);

  if (!(await userExists(message.member))) await createUser(message.member);

  if (message.author.createdTimestamp > dayjs().subtract(1, "hour").valueOf()) {
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
    await addCooldown(cmd.name, message.member, 10);
    await removeBalance(message.member, amount);
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

  await addCooldown(cmd.name, message.member, 10);

  let tax = await getTax();

  if (
    ((await isPremium(message.member)) && (await getTier(message.member)) === 4) ||
    ((await isPremium(target)) && (await getTier(target)) === 4)
  ) {
    tax = 0;
  }

  await removeBalance(message.member, amount);
  addStat(message.author.id, "spent-pay", amount);

  let taxedAmount = 0;

  if (tax > 0) {
    taxedAmount = Math.floor(amount * tax);
    await addToNypsiBank(taxedAmount * 0.5);
    await addBalance(target, amount - taxedAmount);
    addStat(target.user.id, "earned-pay", amount - taxedAmount);
  } else {
    await addBalance(target, amount);
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
      await message.editReply(data as InteractionEditReplyOptions);
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
