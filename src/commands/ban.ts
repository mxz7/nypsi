import {
  CommandInteraction,
  GuildMember,
  Message,
  MessageFlags,
  PermissionFlagsBits,
  User,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { MStoTime } from "../utils/functions/date";
import { isAltPunish } from "../utils/functions/guilds/altpunish";
import { getExactMember } from "../utils/functions/member";
import { getAllGroupAccountIds } from "../utils/functions/moderation/alts";
import { deleteBan, isBanned, newBan } from "../utils/functions/moderation/ban";
import { newCase } from "../utils/functions/moderation/cases";
import { getDuration, pluralize } from "../utils/functions/string";

import dayjs = require("dayjs");

const cmd = new Command(
  "ban",
  "ban one or more users from the server",
  "moderation",
).setPermissions(["BAN_MEMBERS"]);

cmd.slashEnabled = true;
cmd.slashData
  .addUserOption((option) =>
    option.setName("user").setDescription("member to ban from the server").setRequired(true),
  )
  .addStringOption((option) =>
    option.setName("reason").setDescription("reason for the ban").setRequired(false),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return send({ embeds: [new ErrorEmbed("you need the `ban members` permission")] });
    }
    return;
  }

  if (!message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
    return send({
      embeds: [new ErrorEmbed("i need the `ban members` permission for this command to work")],
    });
  }

  if (args.length == 0 || !args[0]) {
    const embed = new CustomEmbed(message.member)
      .setHeader("ban help")
      .addField("usage", "/ban <user> (reason) [-s]")
      .addField(
        "help",
        "**<>** required | **()** optional | **[]** parameter\n" +
          "**<user>** you can either tag the user or use their username\n" +
          "**(reason)** reason for the ban, will be given to all banned members\n" +
          "**[-s]** if used, command message will be deleted and the output will be sent to moderator as a DM if possible",
      );

    return send({ embeds: [embed] });
  }

  const target = await getExactMember(message.guild, args[0]);
  let mode: "target" | "id" = "target";
  let userId: string;

  const punishAlts = await isAltPunish(message.guild);

  if (!target) {
    if (args[0].match(Constants.SNOWFLAKE_REGEX)) {
      mode = "id";
      userId = args[0];
    }
  }

  if (!target && !userId) return send({ embeds: [new ErrorEmbed("invalid user")] });

  let reason = message.author.username + ": ";
  let unbanDate: Date;
  let temporary = false;
  let duration;

  if (args.length > 1) {
    try {
      duration = getDuration(args[1].toLowerCase());
      unbanDate = new Date(Date.now() + duration * 1000);
    } catch {
      // eslint happy
    }

    if (duration) {
      temporary = true;
      args.shift();
    }

    reason = reason + args.slice(1).join(" ");
  } else {
    reason = reason + "no reason given";
  }

  let fail = false;
  let idUser: string;

  if (target?.user.id == message.member.user.id) {
    await send({
      embeds: [new ErrorEmbed("you cannot ban yourself")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const ids = await getAllGroupAccountIds(message.guild, mode === "id" ? userId : target.user.id);

  if (ids.includes(message.member.user.id)) {
    await send({
      embeds: [new ErrorEmbed("you cannot ban one of your alts")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (mode === "id") {
    await message.guild.members
      .ban(userId, {
        reason: reason,
      })
      .then((banned) => {
        if (typeof banned == "string") {
          idUser = banned;
        } else if (banned instanceof User) {
          idUser = `${banned.username}`;
        } else {
          idUser = `${banned.user.username}`;
        }
      })
      .catch(() => {
        fail = true;
        return send({
          embeds: [new ErrorEmbed(`failed to ban: \`${userId}\``)],
        });
      });
  } else {
    const targetHighestRole = target.roles.highest.position;
    const memberHighestRole = message.member.roles.highest.position;

    if (targetHighestRole >= memberHighestRole && message.author.id !== message.guild.ownerId) {
      return send({
        embeds: [new ErrorEmbed(`your role is not high enough to punish ${target.toString()}`)],
      });
    }

    if (target.user.id == message.client.user.id) {
      await send({ content: "NICE TRY LOSER CANT BAN THE BEST BOT" });
      return;
    }

    await message.guild.members
      .ban(target, {
        reason: reason,
      })
      .catch(() => {
        fail = true;
        return send({
          embeds: [new ErrorEmbed(`unable to ban ${target.toString()}`)],
        });
      });
  }

  if (fail) return;

  let banLength = "";

  if (temporary) banLength = MStoTime(duration * 1000, true);

  if (await isBanned(message.guild, mode === "id" ? userId : target))
    await deleteBan(message.guild, mode === "id" ? userId : target);

  const caseId = await doBan(
    message,
    target,
    reason,
    args,
    mode,
    temporary,
    banLength,
    unbanDate,
    userId,
  );

  const embed = new CustomEmbed(message.member);

  if (caseId) embed.setHeader(`ban [${caseId}]`, message.guild.iconURL());

  let msg =
    punishAlts && ids.length > 3
      ? `banning account and any alts...`
      : `\`${mode == "id" ? idUser : target.user.username}\` has been banned`;

  if (!punishAlts && temporary) {
    msg += ` for **${banLength}**`;
  } else if (!punishAlts && reason.split(": ")[1] !== "no reason given") {
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

  let altsBanned = 0;

  if (punishAlts) {
    for (const id of ids) {
      if (id == target?.user.id || userId) continue;
      if (await isBanned(message.guild, id)) await deleteBan(message.guild, id);
      const banned = await doBan(
        message,
        await getExactMember(message.guild, id),
        reason,
        args,
        "target",
        temporary,
        banLength,
        unbanDate,
        id,
        true,
      );
      if (banned) altsBanned++;
    }
  }

  if (altsBanned > 0)
    msg = `\`${target?.user.username || userId}\` + ${altsBanned} ${pluralize("alt has", altsBanned, "alts have")} been banned`;
  else msg = `\`${target?.user.username || userId}\` has been banned`;

  if (temporary) {
    msg += ` for **${banLength}**`;
  } else if (!punishAlts && reason.split(": ")[1] !== "no reason given") {
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

async function doBan(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  target: GuildMember,
  reason: string,
  args: string[],
  mode: string,
  temporary: boolean,
  banLength: string,
  unbanDate: Date,
  userId: string,
  isAlt?: boolean,
) {
  let caseId: number;
  let fail = false;
  if (isAlt) {
    try {
      reason += " (alt)";
      if (mode === "id") {
        await message.guild.members.ban(userId, {
          reason: reason,
        });
      } else {
        const targetHighestRole = target.roles.highest.position;
        const memberHighestRole = message.member.roles.highest.position;

        if (targetHighestRole >= memberHighestRole && message.author.id !== message.guild.ownerId) {
          return false;
        }

        if ((target?.user.id || userId) == message.client.user.id) return false;

        await message.guild.members.ban(target, {
          reason: reason,
        });
      }
    } catch {
      fail = true;
    }
  }
  if (fail) return false;

  let storeReason = reason.split(": ")[1];
  if (temporary) {
    storeReason = `[${banLength}] ${storeReason}`;
  } else {
    storeReason = `[perm] ${storeReason}`;
  }

  if (mode === "id") {
    caseId = await newCase(message.guild, "ban", userId, message.author, storeReason);
    if (temporary) {
      await newBan(message.guild, userId, unbanDate);
    }
  } else {
    caseId = await newCase(message.guild, "ban", target.user.id, message.author, storeReason);

    if (temporary) {
      await newBan(message.guild, target.user.id, unbanDate);
    }

    if (args.join(" ").includes("-s")) return true;

    if (reason.split(": ")[1] == "no reason given") {
      await target
        .send({
          content: `you have been banned from ${message.guild.name}${
            temporary ? `\n\nexpires in **${banLength}**}` : ""
          }`,
        })
        .catch(() => {});
    } else {
      const embed = new CustomEmbed(target)
        .setTitle(`banned from ${message.guild.name}`)
        .addField("reason", `\`${reason.split(": ")[1]}\``, true);

      if (temporary) {
        embed.addField("length", `\`${banLength}\``, true);
        embed.setDescription(`unbanned <t:${dayjs(unbanDate).unix()}:R>`);
      }

      await target
        .send({ content: `you have been banned from ${message.guild.name}`, embeds: [embed] })
        .catch(() => {});
    }
  }
  return caseId;
}

cmd.setRun(run);

module.exports = cmd;
