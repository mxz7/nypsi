import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { createUser, userExists } from "../utils/functions/economy/utils.js";
import { getMember } from "../utils/functions/member.js";
import PageManager from "../utils/functions/page";
import { getAura, getAuraTransactions } from "../utils/functions/users/aura";
import { getLastKnownUsername } from "../utils/functions/users/tag";
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

  if (!(await userExists(target))) await createUser(target);

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

    let pageData: string[] = [];

    /**
     * todo
     * make database return transaction history in ascending order
     * ues that to calc aura at each stage
     * add other commands for take/give etc
     * take aura for brainrot words
     */

    let runningCount = 1000;

    for (const transaction of history) {
      runningCount + transaction.amount;

      pageData.push(
        `**${await getLastKnownUsername(transaction.senderId)}** ${transaction.amount > 0 ? `+${transaction.amount}` : transaction.amount} (${runningCount})\n` +
          `at <t:${Math.floor(transaction.createdAt.getTime() / 1000)}:d> <t:${Math.floor(transaction.createdAt.getTime() / 1000)}:t>\n`,
      );
    }

    pageData.reverse();

    const pages = PageManager.createPages(pageData, 3);

    const historyEmbed = new CustomEmbed(target, pages.get(1).join("\n")).setHeader(
      `${target.user.username}'s aura history`,
      target.user.displayAvatarURL(),
    );

    const historyRow = PageManager.defaultRow();

    const historyMsg = await interaction.editReply({
      embeds: [historyEmbed],
      components: [historyRow],
    });

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
    target = await getMember(message.guild, args.join(" "));

    if (!target) {
      return send({ embeds: [new ErrorEmbed("invalid user")], ephemeral: true });
    }

    return showProfile();
  }
}

cmd.setRun(run);

module.exports = cmd;
