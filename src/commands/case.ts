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

import {
  createEvidence,
  deleteEvidence,
  getMaxEvidenceBytes,
  getUsedEvidenceBytes,
} from "../utils/functions/guilds/evidence";
import { formatBytes } from "../utils/functions/string";
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

  async function displayCase(caseMsg?: Message, interaction?: ButtonInteraction) {
    let caseData = await getCase(message.guild, caseId);

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
      .setHeader("case " + caseData.caseId, message.guild.iconURL())
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
        .setStyle(caseData.evidence ? ButtonStyle.Success : ButtonStyle.Secondary),
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

    if (caseMsg) {
      if (interaction) {
        await interaction
          .update({ embeds: [embed], components: [row] })
          .catch(() => caseMsg.edit({ embeds: [embed], components: [row] }));
      } else {
        await caseMsg.edit({ embeds: [embed], components: [row] });
      }
    } else {
      caseMsg = await send({ embeds: [embed], components: [row] });
    }

    async function listen() {
      const filter = (i: Interaction) => i.user.id == message.author.id;

      const interaction = await caseMsg
        .awaitMessageComponent({ filter, time: 15000, componentType: ComponentType.Button })
        .catch(async () => {
          await caseMsg.edit({ components: [] });
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

        return displayCase(caseMsg);
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

        return displayCase(caseMsg);
      } else if (interaction.customId === "evidence") {
        showEvidence(interaction);
        return listen();
      }
    }

    async function showEvidence(interaction?: ButtonInteraction, evidenceMsg?: Message) {
      const embed = new CustomEmbed(message.member).setHeader(
        `case ${caseData.caseId} evidence`,
        message.guild.iconURL(),
      );
      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

      if (caseData.evidence) {
        const lastKnownUsername = await getLastKnownUsername(caseData.evidence.userId);

        embed
          .setImage(`https://cdn.nypsi.xyz/evidence/${caseData.guildId}/${caseData.evidence.id}`)
          .setDescription(
            `uploaded by: ${lastKnownUsername ? `${lastKnownUsername} ` : ""}\`${caseData.evidence.userId}\`\n` +
              `uploaded at: <t:${Math.floor(caseData.evidence.createdAt.getTime() / 1000)}>\n` +
              `size: \`${formatBytes(Number(caseData.evidence.bytes))}\``,
          );

        if (
          message.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
          message.author.id === caseData.evidence.userId
        ) {
          row.addComponents(
            new ButtonBuilder()
              .setLabel("delete")
              .setEmoji("🗑️")
              .setCustomId("delete")
              .setStyle(ButtonStyle.Danger),
          );
        }
      } else {
        embed.setDescription("no evidence found");
        row.addComponents(
          new ButtonBuilder()
            .setLabel("upload")
            .setCustomId("upload")
            .setEmoji("✉️")
            .setStyle(ButtonStyle.Success),
        );
      }

      const payload: BaseMessageOptions = { embeds: [embed], components: [] };

      if (row.components.length > 0) payload.components = [row];

      if (evidenceMsg) {
        if (interaction) await interaction.update(payload).catch(() => evidenceMsg.edit(payload));
        else evidenceMsg.edit(payload);
      } else {
        if (interaction)
          evidenceMsg = await interaction
            .reply(payload)
            .then((m) => m.fetch())
            .catch(() => interaction.message.edit(payload));
        else evidenceMsg = await evidenceMsg.channel.send(payload);
      }

      async function evidenceListen() {
        const filter = (i: Interaction) => i.user.id == message.author.id;

        const interaction = await evidenceMsg
          .awaitMessageComponent({ filter, time: 15000, componentType: ComponentType.Button })
          .catch(async () => {
            await evidenceMsg.edit({ components: [] });
          });

        if (!interaction) return;

        if (interaction.customId === "delete") {
          let perms = false;
          if (
            message.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
            message.author.id === caseData.evidence.userId
          )
            perms = true;

          if (!perms)
            return interaction.reply({
              embeds: [new ErrorEmbed("you don't have permission to do this")],
              ephemeral: true,
            });

          await deleteEvidence(message.guild, caseData.caseId);
          caseData = await getCase(message.guild, caseData.caseId);
          showEvidence(interaction, evidenceMsg);
          displayCase(caseMsg);
        } else if (interaction.customId === "upload") {
          const check = await getCase(message.guild, caseId);

          if (check.evidence)
            return interaction.reply({
              embeds: [new ErrorEmbed("this case already has evidence")],
              ephemeral: true,
            });

          const [used, max] = await Promise.all([
            getUsedEvidenceBytes(message.guild),
            getMaxEvidenceBytes(message.guild),
          ]);

          if (used > max) {
            return interaction.reply({
              embeds: [
                new ErrorEmbed(
                  "you have used all of your evidence storage\n\n" +
                    `\`${formatBytes(used)}/${formatBytes(max)}\`\n\n` +
                    `to get more storage, join the [official server](https://discord.gg/hJTDNST") and contact **max**`,
                ),
              ],
            });
          }

          const embed = new CustomEmbed(
            message.member,
            `storage: \`${formatBytes(used)}/${formatBytes(max)}\`\n` +
              "max file size: `10 MB`\n\n" +
              "send your evidence in chat (jpeg/png/webp)",
          ).setHeader(`evidence upload for case ${caseData.caseId}`, message.guild.iconURL());

          const evidencePrompt = await interaction
            .reply({ embeds: [embed] })
            .catch(async () => message.channel.send({ embeds: [embed] }));

          const filter = (m: Message) => m.author.id == message.author.id;

          const evidenceMessage = await message.channel
            .awaitMessages({ filter, time: 60000, max: 1 })
            .then((r) => r.first())
            .catch(async () => {
              embed.data.description += "\n\nexpired";
              await evidencePrompt.edit({ embeds: [embed] });
            });

          if (!evidenceMessage) return;

          const attachment = evidenceMessage.attachments.first();

          if (!attachment) {
            return message.channel.send({ embeds: [new ErrorEmbed("you must send an image")] });
          }

          if (attachment.size > 10e6)
            return message.channel.send({
              embeds: [new ErrorEmbed("file too big. max size: 10MB")],
            });

          if (!["jpeg", "jpg", "gif", "png", "webp"].includes(attachment.contentType.split("/")[1]))
            return message.channel.send({
              embeds: [new ErrorEmbed("invalid file type. must be an image")],
            });

          await createEvidence(message.guild, caseData.caseId, message.author.id, attachment.url);

          evidenceMessage.delete().catch(() => null);
          evidencePrompt.delete().catch(() => null);
          caseData = await getCase(message.guild, caseData.caseId);
          showEvidence(null, evidenceMsg);
          displayCase(caseMsg);
        }
      }

      evidenceListen();
    }

    listen();
  }

  displayCase();
}

cmd.setRun(run);

module.exports = cmd;
