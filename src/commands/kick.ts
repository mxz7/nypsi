import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  PermissionFlagsBits,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getExactMember } from "../utils/functions/member";
import { newCase } from "../utils/functions/moderation/cases";

const cmd = new Command("kick", "kick one or more users", "moderation")
  .setPermissions(["KICK_MEMBERS"])
  .setAliases(["fuckoff"]);

cmd.slashEnabled = true;
cmd.slashData
  .addUserOption((option) =>
    option.setName("user").setDescription("user to kick").setRequired(true),
  )
  .addStringOption((option) =>
    option.setName("reason").setDescription("reason for kick").setRequired(true),
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

  if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return send({ embeds: [new ErrorEmbed("you need the `kick members` permission")] });
    }
    return;
  }

  if (!message.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
    return send({
      embeds: [new ErrorEmbed("i need the `kick members` permission for this command to work")],
    });
  }

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0 || !args[0]) {
    const embed = new CustomEmbed(message.member)
      .setHeader("kick help")
      .addField("usage", `${prefix}kick <user> (reason) [-s]`)
      .addField(
        "help",
        "**<>** required | **()** optional | **[]** parameter\n" +
          "**<user>** can tag user or use their usernames\n" +
          "**(reason)** reason for the kick, will be given to all kicked members\n" +
          "**[-s]** if used, command message will be deleted and the output will be sent to moderator as a DM if possible",
      );

    return send({ embeds: [embed] });
  }

  const target = await getExactMember(message.guild, args[0]);
  let reason = message.author.username + ": ";

  if (!target) return send({ embeds: [new ErrorEmbed("invalid user")] });

  if (args.length > 1) {
    reason = reason + args.slice(1).join(" ");
  } else {
    reason = reason + "no reason given";
  }

  const targetHighestRole = target.roles.highest;
  const memberHighestRole = message.member.roles.highest;

  if (
    targetHighestRole.position >= memberHighestRole.position &&
    message.guild.ownerId != message.author.id
  ) {
    return send({
      embeds: [new ErrorEmbed(`your role is not high enough to punish ${target.toString()}`)],
    });
  } else {
    if (target.user.id == message.client.user.id) {
      await send({ content: "NICE TRY LOSER CANT KICK THE BEST WORLDWIDE" });
      return;
    }

    await target.kick(reason);
  }

  const caseId = await newCase(
    message.guild,
    "kick",
    target.user.id,
    message.author,
    reason.split(": ")[1],
  );

  const embed = new CustomEmbed(message.member);

  if (caseId) embed.setHeader(`kick [${caseId}]`, message.guild.iconURL());

  let msg = `\`${target.user.username}\` has been kicked`;

  if (reason.split(": ")[1] !== "no reason given") {
    msg += ` for **${reason.split(": ")[1]}**`;
  }

  embed.setDescription(msg);

  if (args.join(" ").includes("-s")) {
    if (message instanceof Message) {
      await message.delete();
      await message.member.send({ embeds: [embed] }).catch(() => {});
    } else {
      await message.reply({ embeds: [embed], ephemeral: true });
    }
  } else {
    await send({ embeds: [embed] });
  }

  if (args.join(" ").includes("-s")) return;

  if (reason.split(": ")[1] == "no reason given") {
    await target
      .send({ content: `you have been kicked from ${message.guild.name}` })
      .catch(() => {});
  } else {
    const embed = new CustomEmbed(target)
      .setTitle(`kicked from ${message.guild.name}`)
      .addField("reason", `\`${reason.split(": ")[1]}\``);

    await target
      .send({ content: `you have been kicked from ${message.guild.name}`, embeds: [embed] })
      .catch(() => {});
  }
}

cmd.setRun(run);

module.exports = cmd;
