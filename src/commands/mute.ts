import {
  BaseMessageOptions,
  CommandInteraction,
  GuildMember,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageFlags,
  PermissionFlagsBits,
  Role,
  ThreadChannel,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { isAltPunish } from "../utils/functions/guilds/altpunish";
import { getExactMember } from "../utils/functions/member";
import { getAllGroupAccountIds } from "../utils/functions/moderation/alts";
import { newCase } from "../utils/functions/moderation/cases";
import { deleteMute, getMuteRole, isMuted, newMute } from "../utils/functions/moderation/mute";

import ms = require("ms");
import dayjs = require("dayjs");

const cmd = new Command("mute", "mute a user", "moderation").setPermissions([
  "MANAGE_MESSAGES",
  "MODERATE_MEMBERS",
]);

cmd.slashEnabled = true;
cmd.slashData
  .addUserOption((option) =>
    option.setName("user").setDescription("user to mute").setRequired(true),
  )
  .addStringOption((option) => option.setName("reason").setDescription("reason for the mute"));

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return;
    }
  }

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

  if (
    !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles) ||
    !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)
  ) {
    return send({
      embeds: [
        new ErrorEmbed(
          "i need the `manage roles` and `manage channels` permission for this command to work",
        ),
      ],
    });
  }

  if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    return send({
      embeds: [new ErrorEmbed("i need the `moderate members` permission for this command to work")],
    });
  }

  if (args.length == 0 || !args[0]) {
    const embed = new CustomEmbed(message.member)
      .setHeader("mute help")
      .addField("usage", "/mute <user> (time) (reason) [-s]")
      .addField("help", "if the mute role isnt setup correctly this wont work")
      .addField(
        "time format examples",
        "**1d** *1 day*\n**10h** *10 hours*\n**15m** *15 minutes*\n**30s** *30 seconds*",
      );
    return send({ embeds: [embed] });
  }

  const target = await getExactMember(message.guild, args[0]);
  let reason = "";

  if (!target) return send({ embeds: [new ErrorEmbed("invalid user")] });

  const punishAlts = await isAltPunish(message.guild);

  if (args.length > 1) {
    reason = args.slice(1).join(" ");
  }

  let mode = "role";

  const guildMuteRole = await getMuteRole(message.guild);

  let muteRole: Role;

  if (!guildMuteRole || guildMuteRole == "default") {
    muteRole = message.guild.roles.cache.find((r) => r.name.toLowerCase() == "muted");

    if (!muteRole) {
      let channelError = false;
      try {
        const newMuteRole = await message.guild.roles
          .create({
            name: "muted",
          })
          .catch(() => {
            channelError = true;
          });

        if (newMuteRole instanceof Role) {
          muteRole = newMuteRole;
        }

        message.guild.channels.cache.forEach(async (channel) => {
          if (channel instanceof ThreadChannel) return;
          await channel.permissionOverwrites
            .edit(muteRole, {
              SendMessages: false,
              Speak: false,
              AddReactions: false,
              SendMessagesInThreads: false,
              CreatePublicThreads: false,
              CreatePrivateThreads: false,
            })
            .catch(() => {
              channelError = true;
            });
        });
      } catch (e) {
        return send({
          embeds: [
            new ErrorEmbed(
              "error creating mute role - make sure i have `manage roles` permission and `manage channels`",
            ),
          ],
        });
      }
      if (channelError) {
        return send({
          embeds: [
            new ErrorEmbed(
              "error creating mute role - make sure i have `manage roles` permission and `manage channels`",
            ),
          ],
        });
      }
    }
  } else if (guildMuteRole == "timeout") {
    mode = "timeout";
  } else {
    muteRole = await message.guild.roles.cache.get(guildMuteRole);

    if (!muteRole) {
      return send({ embeds: [new ErrorEmbed(`failed to find muterole: ${guildMuteRole}`)] });
    }
  }

  let timedMute = false;
  let unmuteDate: Date;
  let time = 0;

  if (reason != "") {
    time = getDuration(reason.split(" ")[0].toLowerCase());
    unmuteDate = new Date(Date.now() + time * 1000);

    if (time) {
      timedMute = true;
      reason = reason.split(" ").slice(1).join(" ");
    }
  }

  if (mode == "timeout" && !timedMute) {
    unmuteDate = dayjs().add(28, "day").toDate();
    time = ms("28 days") / 1000;

    timedMute = true;
  } else if (mode === "timeout" && timedMute) {
    if (time > ms("28 days")) {
      unmuteDate = dayjs().add(28, "days").toDate();
      time = ms("28 days") / 1000;
    }
  }

  let fail = false;

  if (target.user.id == message.member.user.id) {
    await message.channel.send({ embeds: [new ErrorEmbed("you cannot mute yourself")] });
    return;
  }

  const ids = await getAllGroupAccountIds(message.guild, target.user.id);

  if (ids.includes(message.member.user.id)) {
    await message.channel.send({ embeds: [new ErrorEmbed("you cannot mute one of your alts")] });
    return;
  }

  if (mode == "role") {
    if (target.user.id == message.client.user.id) {
      await message.channel.send({ content: "you'll never shut me up 😏" });
      return;
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
      await target.roles.add(muteRole).catch(() => {
        fail = true;

        return send({
          embeds: [
            new ErrorEmbed(
              "i am unable to give users the mute role - ensure my role is above the 'muted' role",
            ),
          ],
        });
      });
    }
    if (fail) return;
  } else if (mode == "timeout") {
    if (target.user.id == message.client.user.id) {
      return await message.channel.send({ content: "youll never shut me up 😏" });
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
    } else if (target.isCommunicationDisabled() as boolean) {
      return send({ embeds: [new ErrorEmbed(`${target.user.toString()} is already timed out`)] });
    } else {
      await target.disableCommunicationUntil(unmuteDate, reason).catch(() => {
        fail = true;
        return send({
          embeds: [
            new ErrorEmbed(
              "i am unable to timeout users, ensure my role is high enough and i have the permission",
            ),
          ],
        });
      });
    }
    if (fail) return;
  }

  if (fail) return;

  let mutedLength = "";

  if (timedMute) {
    mutedLength = getTime(time * 1000);
  }

  const caseId = await doMute(
    message,
    target,
    reason,
    args,
    mode,
    timedMute,
    mutedLength,
    unmuteDate,
  );

  const embed = new CustomEmbed(message.member);

  if (caseId) embed.setHeader(`mute [${caseId}]`, message.guild.iconURL());

  let msg =
    punishAlts && ids.length > 3
      ? `muting account and any alts...`
      : `\`${target.user.username}\` has been muted`;

  if (!punishAlts && timedMute) {
    msg += ` for **${mutedLength}**`;
  } else if (!punishAlts && reason) {
    msg += ` for **${reason}**`;
  }

  embed.setDescription(msg);

  let res;

  if (ids.length > 3) {
    if (args.join(" ").includes("-s")) {
      if (message instanceof Message) {
        await message.delete();
        res = await message.member.send({ embeds: [embed] }).catch(() => {});
      } else {
        res = await message.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
    } else {
      res = await send({ embeds: [embed] });
    }
  }

  let altsMuted = 0;

  if (punishAlts) {
    for (const id of ids) {
      if (id == target.user.id) continue;
      if (await isMuted(message.guild, id)) await deleteMute(message.guild, id);
      const muted = await doMute(
        message,
        await getExactMember(message.guild, id),
        reason,
        args,
        mode,
        timedMute,
        mutedLength,
        unmuteDate,
        muteRole,
        true,
      );
      if (muted) altsMuted++;
    }
  }

  if (altsMuted > 0)
    msg = `\`${target.user.username}\` + ${altsMuted} ${
      altsMuted != 1 ? "alts have" : "alt has"
    } been muted`;
  else msg = `\`${target.user.username}\` has been muted`;

  if (timedMute) {
    msg += ` for **${mutedLength}**`;
  } else if (reason) {
    msg += ` for **${reason}**`;
  }

  embed.setDescription(msg);

  if (ids.length > 3) {
    if (message instanceof Message) {
      await (res as Message).edit({ embeds: [embed] });
    } else {
      await message.editReply({ embeds: [embed] });
    }
  } else {
    if (args.join(" ").includes("-s")) {
      if (message instanceof Message) {
        await message.delete();
        await message.member.send({ embeds: [embed] }).catch(() => {});
      } else {
        await message.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
    } else {
      await send({ embeds: [embed] });
    }
  }
}

async function doMute(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  target: GuildMember,
  reason: string,
  args: string[],
  mode: string,
  timedMute: boolean,
  mutedLength: string,
  unmuteDate: Date,
  muteRole?: Role,
  isAlt?: boolean,
) {
  let fail = false;
  if (isAlt) {
    reason += " (alt)";

    try {
      if (target.user.id == message.client.user.id) return false;

      if (mode == "role") {
        const targetHighestRole = target.roles.highest;
        const memberHighestRole = message.member.roles.highest;

        if (
          targetHighestRole.position >= memberHighestRole.position &&
          message.guild.ownerId != message.author.id
        )
          return false;
        await target.roles.add(muteRole).catch(() => (fail = true));
      } else if (mode == "timeout") {
        const targetHighestRole = target.roles.highest;
        const memberHighestRole = message.member.roles.highest;

        if (
          (targetHighestRole.position >= memberHighestRole.position &&
            message.guild.ownerId != message.author.id) ||
          (target.isCommunicationDisabled() as boolean)
        )
          return false;
        else await target.disableCommunicationUntil(unmuteDate, reason).catch(() => (fail = true));
      }
    } catch {
      fail = true;
    }
  }
  if (fail) return false;

  let storeReason = reason;

  if (!timedMute) {
    storeReason = "[perm] " + reason;
  } else {
    storeReason = `[${mutedLength}] ${reason}`;
  }

  const caseId = await newCase(message.guild, "mute", target.user.id, message.author, storeReason);

  if (await isMuted(message.guild, target)) {
    await deleteMute(message.guild, target);
  }

  if (timedMute && mode !== "timeout") {
    await newMute(message.guild, [target.user.id], unmuteDate);
  }

  if (!timedMute && mode !== "timeout") {
    await newMute(message.guild, [target.user.id], new Date(3130000000000));
  }

  if (args.join(" ").includes("-s")) return true;
  if (!timedMute) {
    const embed = new CustomEmbed(target)
      .setTitle(`muted in ${message.guild.name}`)
      .addField("length", "`permanent`", true);

    if (reason != "") {
      embed.addField("reason", `\`${reason}\``, true);
    }

    await target
      .send({ content: `you have been muted in ${message.guild.name}`, embeds: [embed] })
      .catch(() => {});
  } else {
    const embed = new CustomEmbed(target)
      .setTitle(`muted in ${message.guild.name}`)
      .setDescription(`unmuted <t:${dayjs(unmuteDate).unix()}:R>`)
      .addField("length", `\`${mutedLength}\``, true);

    if (reason != "") {
      embed.addField("reason", `\`${reason}\``, true);
    }

    await target
      .send({ content: `you have been muted in ${message.guild.name}`, embeds: [embed] })
      .catch(() => {});
  }

  return caseId;
}

cmd.setRun(run);

module.exports = cmd;

export function getDuration(duration: string): number {
  duration.toLowerCase();

  if (duration.includes("d")) {
    if (!parseInt(duration.split("d")[0])) return undefined;

    const num = parseInt(duration.split("d")[0]);

    return num * 86400;
  } else if (duration.includes("h")) {
    if (!parseInt(duration.split("h")[0])) return undefined;

    const num = parseInt(duration.split("h")[0]);

    return num * 3600;
  } else if (duration.includes("m")) {
    if (!parseInt(duration.split("m")[0])) return undefined;

    const num = parseInt(duration.split("m")[0]);

    return num * 60;
  } else if (duration.includes("s")) {
    if (!parseInt(duration.split("s")[0])) return undefined;

    const num = parseInt(duration.split("s")[0]);

    return num;
  }
}

function getTime(ms: number) {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const daysms = ms % (24 * 60 * 60 * 1000);
  const hours = Math.floor(daysms / (60 * 60 * 1000));
  const hoursms = ms % (60 * 60 * 1000);
  const minutes = Math.floor(hoursms / (60 * 1000));
  const minutesms = ms % (60 * 1000);
  const sec = Math.floor(minutesms / 1000);

  let output = "";

  if (days > 0) {
    let a = " days";

    if (days == 1) {
      a = " day";
    }

    output = days + a;
  }

  if (hours > 0) {
    let a = " hours";

    if (hours == 1) {
      a = " hour";
    }

    if (output == "") {
      output = hours + a;
    } else {
      output = `${output} ${hours}${a}`;
    }
  }

  if (minutes > 0) {
    let a = " mins";

    if (minutes == 1) {
      a = " min";
    }

    if (output == "") {
      output = minutes + a;
    } else {
      output = `${output} ${minutes}${a}`;
    }
  }

  if (sec > 0) {
    output = output + sec + "s";
  }

  return output;
}
