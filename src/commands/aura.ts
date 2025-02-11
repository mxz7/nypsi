import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { createUser, isEcoBanned, userExists } from "../utils/functions/economy/utils.js";
import { getMember } from "../utils/functions/member.js";
import { getAllGroupAccountIds } from "../utils/functions/moderation/alts";
import PageManager from "../utils/functions/page";
import { createAuraTransaction, getAura, getAuraTransactions } from "../utils/functions/users/aura";
import { isUserBlacklisted } from "../utils/functions/users/blacklist";
import { getLastKnownUsername } from "../utils/functions/users/tag";
import { hasProfile } from "../utils/functions/users/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import ms = require("ms");

const cmd = new Command("aura", "aura check", "fun").setAliases([
  "socialcreditscore",
  "elo",
  "scs",
]);

cmd.slashEnabled = true;

cmd.slashData.addUserOption((option) =>
  option.setName("user").setDescription("aura check this user").setRequired(false),
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

  let target = message.member;

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  await addCooldown(cmd.name, message.member, 5);

  if (message.author.createdTimestamp > Date.now() - ms("2 weeks")) {
    return send({
      embeds: [new ErrorEmbed("your account is too new for aura 🙄")],
      ephemeral: true,
    });
  }

  const showProfile = async () => {
    const aura = await getAura(target.user.id);

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("history")
        .setLabel("history")
        .setEmoji("📖")
        .setStyle(ButtonStyle.Secondary),
    );

    const embed = new CustomEmbed(
      target,
      `${target.user.username} has **${aura.toLocaleString()}** aura`,
    ).setHeader(`${target.user.username}`, target.user.displayAvatarURL());

    if (target.user.id === target.client.user.id) return send({ embeds: [embed] });

    const msg = await send({ embeds: [embed], components: [row] });

    const interaction = await msg
      .awaitMessageComponent({
        filter: (i) => i.user.id === message.author.id,
        time: 30000,
        componentType: ComponentType.Button,
      })
      .catch(() => {
        row.components[0].setDisabled(true);
        msg.edit({ components: [row] });
      });

    if (!interaction) return;

    await interaction.deferReply();

    const history = await getAuraTransactions(target.user.id);

    if (history.length === 0)
      return interaction.editReply({ embeds: [new ErrorEmbed("no history to show")] });

    const pageData: string[] = [];

    let runningCount = 1000;

    for (const transaction of history) {
      if (
        (transaction.senderId === target.user.id && transaction.amount > 0) ||
        (transaction.recipientId === target.user.id && transaction.amount > 0)
      ) {
        if (transaction.senderId === target.user.id) runningCount -= transaction.amount;
        else runningCount += transaction.amount;

        pageData.push(
          `**${await getLastKnownUsername(transaction.senderId)}** → **${await getLastKnownUsername(transaction.recipientId)}** ${Math.abs(transaction.amount).toLocaleString()} (${runningCount.toLocaleString()})\n` +
            ` - <t:${Math.floor(transaction.createdAt.getTime() / 1000)}:d> <t:${Math.floor(transaction.createdAt.getTime() / 1000)}:t>\n`,
        );
      } else if (
        (transaction.senderId === target.user.id && transaction.amount < 0) ||
        (transaction.recipientId === target.user.id && transaction.amount < 0)
      ) {
        if (transaction.senderId === target.user.id) runningCount -= transaction.amount;
        else runningCount += transaction.amount;

        pageData.push(
          `**${await getLastKnownUsername(transaction.recipientId)}** → **${await getLastKnownUsername(transaction.senderId)}** ${Math.abs(transaction.amount).toLocaleString()} (${runningCount.toLocaleString()})\n` +
            ` - <t:${Math.floor(transaction.createdAt.getTime() / 1000)}:d> <t:${Math.floor(transaction.createdAt.getTime() / 1000)}:t>\n`,
        );
      }
    }

    pageData.reverse();

    const pages = PageManager.createPages(pageData, 3);

    const historyEmbed = new CustomEmbed(target, pages.get(1).join("\n")).setHeader(
      `${target.user.username}'s aura history`,
      target.user.displayAvatarURL(),
    );

    const historyRow = PageManager.defaultRow();

    let historyMsg: Message;

    if (pages.size > 1)
      historyMsg = await interaction.editReply({
        embeds: [historyEmbed],
        components: [historyRow],
      });
    else return interaction.editReply({ embeds: [historyEmbed] });

    const manager = new PageManager({
      pages,
      message: historyMsg,
      userId: message.author.id,
      embed: historyEmbed,
      row: historyRow,
      allowMessageDupe: true,
    });

    return manager.listen();
  };

  if (args.length === 0) return showProfile();
  else {
    target = await getMember(message.guild, args[0]);

    if (!target) {
      return send({ embeds: [new ErrorEmbed("invalid user")], ephemeral: true });
    }

    if (!(await hasProfile(target)))
      return send({
        embeds: [new ErrorEmbed(`${target.toString()} has never used nypsi. what a LOSER lol.`)],
      });

    if (!(await userExists(target))) await createUser(target);

    if (await isUserBlacklisted(target.user.id))
      return send({
        embeds: [
          new ErrorEmbed(
            `${target.user.toString()} is blacklisted 😬. they did something REALLY bad. laugh at them for me. lol. AHHAHAAHHA`,
          ),
        ],
      });

    if ((await isEcoBanned(target.user.id)).banned)
      return send({ embeds: [new ErrorEmbed(`${target.toString()} is banned AHAHAHAHA`)] });

    if (args.length === 1) {
      return showProfile();
    }

    if (target.user.id === message.author.id) {
      await createAuraTransaction(message.author.id, message.client.user.id, -50);

      return send({ embeds: [new ErrorEmbed("that's pretty sad. -50 aura")] });
    }

    const groupIds = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, message.author.id);

    if (groupIds.length > 0 && groupIds[0] !== message.author.id) {
      return send({ embeds: [new ErrorEmbed("you cannot do this")] });
    }

    if (
      args[1].toLowerCase() === "give" ||
      args[1].toLowerCase().startsWith("+") ||
      args[1] === "+"
    ) {
      const groupIds = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, message.author.id);

      if (groupIds.length > 0 && groupIds[0] !== message.author.id)
        return send({ embeds: [new ErrorEmbed("you cannot give aura")] });

      let amount: number;

      if (args.length > 2) amount = parseInt(args[2]);
      else amount = parseInt(args[1]);

      if (amount === 0 || isNaN(amount) || !amount) {
        await createAuraTransaction(message.author.id, message.client.user.id, -50);

        return send({ embeds: [new ErrorEmbed("invalid amount. -50 aura")] });
      }

      const aura = await getAura(message.author.id);

      if (aura < amount) {
        await createAuraTransaction(message.author.id, message.client.user.id, -10);

        return send({ embeds: [new ErrorEmbed("you don't have this much aura. damn. -10 aura")] });
      }

      let amountGiven = amount;

      if (amount > 10) {
        amountGiven = Math.floor(Math.random() * (amount / 2)) + amount / 2;
      }

      await createAuraTransaction(target.user.id, message.author.id, amountGiven);

      return send({
        embeds: [
          new CustomEmbed(target, `+${Math.abs(amountGiven).toLocaleString()} aura`).setHeader(
            target.user.username,
            target.user.displayAvatarURL(),
          ),
        ],
      });
    } else if (
      args[1].toLowerCase() === "take" ||
      args[1].toLowerCase() === "-" ||
      args[1].toLowerCase().startsWith("-")
    ) {
      if (await onCooldown(`${cmd.name}:${target.user.id}`, message.member)) {
        await createAuraTransaction(message.author.id, message.client.user.id, -50);

        return send({
          embeds: [new ErrorEmbed("you've already taken aura from this user recently. -50 aura")],
        });
      }

      const groupIds = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, target.user.id);

      if (
        (groupIds.length > 0 && groupIds[0] !== target.user.id) ||
        message.client.user.id === target.user.id
      ) {
        await createAuraTransaction(message.author.id, message.client.user.id, -10);

        return send({ embeds: [new ErrorEmbed("this user cannot be stolen from. -10 aura")] });
      }

      let amount: number;

      if (args.length > 2) amount = parseInt(args[2]);
      else amount = parseInt(args[1]);

      if (amount === 0 || isNaN(amount) || !amount) {
        await createAuraTransaction(message.author.id, message.client.user.id, -50);

        return send({ embeds: [new ErrorEmbed("invalid amount. -50 aura")] });
      }

      const aura = await getAura(message.author.id);

      amount = Math.abs(amount);

      if (amount > aura * 2)
        return send({ embeds: [new ErrorEmbed("you don't have enough aura to take this 🙄")] });

      const targetAura = await getAura(target.user.id);

      if (targetAura < aura / 2.5) {
        createAuraTransaction(message.author.id, target.user.id, -50);
        return send({ embeds: [new ErrorEmbed("pick on someone your own size. -50 aura")] });
      }

      let amountGiven = amount;

      if (amount > 10) {
        amountGiven = Math.floor(Math.random() * (amount / 2)) + amount / 2;
      }

      const fail = Math.floor(Math.random() * 10);

      if (fail < 3 || target.user.id === message.client.user.id) {
        amountGiven = Math.floor(amountGiven * 1.5);
        await createAuraTransaction(target.user.id, message.author.id, amountGiven);

        return send({
          embeds: [
            new CustomEmbed(
              message.member,
              `declined. -${amountGiven.toLocaleString()} aura`,
            ).setHeader(message.author.username, message.author.displayAvatarURL()),
          ],
        });
      }

      await addCooldown(`${cmd.name}:${target.user.id}`, message.member, 600);
      await createAuraTransaction(target.user.id, message.author.id, -Math.abs(amountGiven));

      return send({
        embeds: [
          new CustomEmbed(target, `-${Math.abs(amountGiven).toLocaleString()} aura`).setHeader(
            target.user.username,
            target.user.displayAvatarURL(),
          ),
        ],
      });
    }
  }
}

cmd.setRun(run);

module.exports = cmd;
