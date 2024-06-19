import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
  PermissionFlagsBits,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { getPrefix } from "../utils/functions/guilds/utils";
import { deleteCase, getCase } from "../utils/functions/moderation/cases";

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
        "to delete a case, react with ❌ after running the command\n" +
          "dates are in MM/DD/YYYY format\n" +
          `to delete data for the server, run ${prefix}**deleteallcases**\nto delete a case you need the \`manage server\` permission`,
      );

    return send({ embeds: [embed] });
  }

  const caseData = await getCase(message.guild, parseInt(args[0]));

  if (!caseData) {
    return send({
      embeds: [new ErrorEmbed("couldn't find a case with the id `" + args[0] + "`")],
    });
  }

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
    new ButtonBuilder().setCustomId("❌").setLabel("delete").setStyle(ButtonStyle.Danger),
  );

  let msg: Message;

  if (message.member.permissions.has(PermissionFlagsBits.ManageGuild) && !caseData.deleted) {
    msg = await send({ embeds: [embed], components: [row] });
  } else {
    return await send({ embeds: [embed] });
  }

  const edit = async (data: MessageEditOptions, msg: Message) => {
    if (!(message instanceof Message)) {
      await message.editReply(data).catch(() => {});
      return await message.fetchReply();
    } else {
      return await msg.edit(data).catch(() => {});
    }
  };

  const filter = (i: Interaction) => i.user.id == message.author.id;

  const reaction = await msg
    .awaitMessageComponent({ filter, time: 15000 })
    .then(async (collected) => {
      await collected.deferUpdate();
      return collected.customId;
    })
    .catch(async () => {
      await edit({ components: [] }, msg);
    });

  if (reaction == "❌") {
    await deleteCase(message.guild, caseData.caseId);

    const newEmbed = new CustomEmbed(
      message.member,
      "✅ case `" + caseData.caseId + "` successfully deleted by " + message.member.toString(),
    );

    await edit({ embeds: [newEmbed], components: [] }, msg);
  }
}

cmd.setRun(run);

module.exports = cmd;
