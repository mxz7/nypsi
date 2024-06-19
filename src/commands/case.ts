import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { getPrefix } from "../utils/functions/guilds/utils";
import { deleteCase, getCase, restoreCase } from "../utils/functions/moderation/cases";

import { getLastKnownUsername } from "../utils/functions/users/tag";

const cmd = new Command("case", "get information about a given case", "moderation")
  .setPermissions(["MANAGE_MESSAGES", "MANAGE_SERVER", "MODERATE_MEMBERS"])
  .setDocs("https://docs.nypsi.xyz/moderation/cases");

cmd.slashEnabled = true;
cmd.slashData.addIntegerOption((option) =>
  option
    .setName("case-number")
    .setDescription("what case would you like to view")
    .setRequired(true),
);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return;
    }
  }

  const prefix = (await getPrefix(message.guild))[0];

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

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member)
      .setHeader("case help")
      .addField("usage", `${prefix}case <caseID>`)
      .addField(
        "help",
        `to delete data for the server, run ${prefix}**deleteallcases**\nto delete a case you need the \`manage server\` permission`,
      );

    return send({ embeds: [embed] });
  }

  const caseId = parseInt(args[0]);

  if (isNaN(caseId) || (!caseId && caseId !== 0))
    return send({
      embeds: [new ErrorEmbed("couldn't find a case with the id `" + args[0] + "`")],
    });

  async function displayCase(msg?: Message, interaction?: ButtonInteraction) {
    const caseData = await getCase(message.guild, caseId);

    if (!caseData)
      return send({
        embeds: [new ErrorEmbed("couldn't find a case with the id `" + args[0] + "`")],
      });

    const target = await message.guild.members.fetch(caseData.user).catch(() => {});

    let reason = caseData.command;

    if (reason == "") {
      reason = "no reason specified";
    }

    let moderator = `\`${caseData.moderator}\``;

    if (caseData.moderator.match(Constants.SNOWFLAKE_REGEX)) {
      const username = await getLastKnownUsername(caseData.moderator).catch(() => "");

      if (username) moderator = `${username}\n\`${caseData.moderator}\``;
    }

    const embed = new CustomEmbed(message.member)
      .setHeader("case " + caseData.caseId)
      .addField("type", "`" + caseData.type + "`", true)
      .addField("moderator", moderator, true)
      .addField("date/time", `<t:${Math.floor(caseData.time.getTime() / 1000)}>`, true)
      .addField("user", `${target ? `${target.toString()}\n` : ""} \`${caseData.user}\``, true)
      .addField("reason", reason, true)
      .addField("deleted", caseData.deleted.toString(), true);

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("evidence")
        .setEmoji("📋")
        .setLabel("evidence")
        .setStyle(ButtonStyle.Success),
    );

    if (message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      if (caseData.deleted) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId("restore")
            .setLabel("restore")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("♻️"),
        );
      } else {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId("delete")
            .setLabel("delete")
            .setEmoji("🗑️")
            .setStyle(ButtonStyle.Danger),
        );
      }
    }

    if (msg) {
      if (interaction) {
        await interaction
          .update({ embeds: [embed], components: [row] })
          .catch(() => msg.edit({ embeds: [embed], components: [row] }));
      } else {
        await msg.edit({ embeds: [embed], components: [row] });
      }
    } else {
      msg = await send({ embeds: [embed], components: [row] });
    }

    async function listen() {
      const filter = (i: Interaction) => i.user.id == message.author.id;

      const interaction = await msg
        .awaitMessageComponent({ filter, time: 15000, componentType: ComponentType.Button })
        .catch(async () => {
          await msg.edit({ components: [] });
        });

      if (!interaction) return;

      if (interaction.customId === "delete") {
        if (caseData.deleted) {
          await interaction.reply({
            embeds: [new ErrorEmbed("case is already marked as deleted")],
            ephemeral: true,
          });
          return listen();
        }
        await deleteCase(message.guild, caseData.caseId);

        await interaction.reply({
          embeds: [new CustomEmbed(message.member, "✅ case marked as deleted")],
          ephemeral: true,
        });

        return displayCase(msg);
      } else if (interaction.customId === "restore") {
        if (!caseData.deleted) {
          await interaction.reply({
            embeds: [new ErrorEmbed("case is not marked as deleted")],
            ephemeral: true,
          });
          return listen();
        }

        await restoreCase(message.guild, caseData.caseId);

        await interaction.reply({
          embeds: [new CustomEmbed(message.member, "✅ case restored")],
          ephemeral: true,
        });
      }
    }

    listen();
  }

  displayCase();
}

cmd.setRun(run);

module.exports = cmd;
