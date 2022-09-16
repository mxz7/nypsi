import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
  MessageOptions,
  PermissionFlagsBits,
} from "discord.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders.js";
import { createProfile, deleteCase, getCase, profileExists } from "../utils/moderation/utils";

const cmd = new Command("case", "get information about a given case", Categories.MODERATION)
  .setPermissions(["MANAGE_MESSAGES", "MANAGE_SERVER", "MODERATE_MEMBERS"])
  .setDocs("https://docs.nypsi.xyz/moderation/cases");

cmd.slashEnabled = true;
cmd.slashData.addIntegerOption((option) =>
  option.setName("case-number").setDescription("what case would you like to view").setRequired(true)
);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return;
    }
  }

  const prefix = await getPrefix(message.guild);

  const send = async (data: MessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions);
      }
      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as MessageOptions);
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
          `to delete data for the server, run ${prefix}**deleteallcases**\nto delete a case you need the \`manage server\` permission`
      );

    return send({ embeds: [embed] });
  }

  if (!(await profileExists(message.guild))) await createProfile(message.guild);

  const case0 = await getCase(message.guild, parseInt(args[0]));

  if (!case0) {
    return send({
      embeds: [new ErrorEmbed("couldn't find a case with the id `" + args[0] + "`")],
    });
  }

  const target = await message.guild.members.fetch(case0.user).catch(() => {});

  let reason = case0.command;

  if (reason == "") {
    reason = "no reason specified";
  }

  const embed = new CustomEmbed(message.member)
    .setHeader("case " + case0.caseId)
    .addField("type", "`" + case0.type + "`", true)
    .addField("moderator", case0.moderator, true)
    .addField("date/time", `<t:${Math.floor(case0.time.getTime() / 1000)}>`, true)
    .addField("user", "`" + case0.user + "`", true)
    .addField("reason", reason, true)
    .addField("deleted", case0.deleted.toString(), true);

  if (target) {
    embed.setDescription("punished user: " + target.toString());
  }

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("❌").setLabel("delete").setStyle(ButtonStyle.Danger)
  );

  let msg: Message;

  if (message.member.permissions.has(PermissionFlagsBits.ManageGuild) && !case0.deleted) {
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
    await deleteCase(message.guild, case0.caseId.toString());

    const newEmbed = new CustomEmbed(
      message.member,
      "✅ case `" + case0.caseId + "` successfully deleted by " + message.member.toString()
    );

    await edit({ embeds: [newEmbed], components: [] }, msg);
  }
}

cmd.setRun(run);

module.exports = cmd;
