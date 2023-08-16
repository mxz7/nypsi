import {
  BaseMessageOptions,
  CommandInteraction,
  GuildMember,
  InteractionReplyOptions,
  Message,
  PermissionFlagsBits,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { getExactMember } from "../utils/functions/member";
import { isBanned, newBan } from "../utils/functions/moderation/ban";
import { newCase } from "../utils/functions/moderation/cases";
import { createProfile, profileExists } from "../utils/functions/moderation/utils";
import { getAlts, getMainAccount, isAlt } from "../utils/functions/moderation/alts";
import { logger } from "../utils/logger";
import { isAltPunish } from "../utils/functions/guilds/altpunish";

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

  if (!(await profileExists(message.guild))) await createProfile(message.guild);

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

  let target = await getExactMember(message.guild, args[0]);
  let mode: "target" | "id" = "target";
  let userId: string;

  const punishAlts = await isAltPunish(message.guild);

  let alts = await getAlts(message.guild, target.user.id).catch(() => []);

  if (!target) {
    if (args[0].match(Constants.SNOWFLAKE_REGEX)) {
      mode = "id";
      userId = args[0];
      alts = await getAlts(message.guild, args[0]);
    }
  } else if (punishAlts) {
    if (await isAlt(message.guild, target.user.id)) {
      target = await getExactMember(message.guild, await getMainAccount(message.guild, target.user.id));
      alts = await getAlts(message.guild, target.user.id).catch(() => []);
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

  if (mode === "id") {
    /*await message.guild.members
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
      });*/logger.debug(`"banned" ${userId}`);
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
      /*.ban(target, {
        reason: reason,
      })
      .catch(() => {
        fail = true;
        return send({
          embeds: [new ErrorEmbed(`unable to ban ${target.toString()}`)],
        });
      });*/
      logger.debug(`"banned" ${target.user.id}`);
  }

  if (fail) return;

  let banLength = "";

  if (temporary) banLength = getTime(duration * 1000);

  const embed = new CustomEmbed(message.member);

  let msg = `✅ \`${mode == "id" ? idUser : target.user.username}\` has been banned`;

  if (alts.length > 0 && punishAlts) {
    msg = `✅ \`${mode == "id" ? idUser : target.user.username}\` + ${alts.length} ${alts.length != 1 ? "alts have" : "alt has"} been banned`;
  }

  if (temporary) {
    msg += ` for **${banLength}**`;
  } else if (reason.split(": ")[1] !== "no reason given") {
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

  
  await doBan(message, target, reason, args, mode, temporary, banLength, unbanDate, userId);

  if (!punishAlts) return;

  for (const id of alts) {
    if (!isBanned(message.guild, id.userId)) await doBan(message, await getExactMember(message.guild, id.userId), reason, args, "target", temporary, banLength, unbanDate, id.userId, true);
  }
}

async function doBan(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
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
  let fail = false
  if (isAlt) {
    try {
      reason += " (alt)";
      if (mode === "id") {
        /*await message.guild.members
          .ban(userId, {
            reason: reason,
          });*/logger.debug(`"banned" ${userId}`);
      } else {
        const targetHighestRole = target.roles.highest.position;
        const memberHighestRole = message.member.roles.highest.position;
    
        if (targetHighestRole >= memberHighestRole && message.author.id !== message.guild.ownerId) {
          return;
        }
    
        if (target.user.id == message.client.user.id) return;
    /*
        await message.guild.members
          .ban(target, {
            reason: reason,
          });*/logger.debug(`"banned" ${target.user.id}`);
      }
    } catch {
      fail = true;
    }
  }
  if (fail) return;

  let storeReason = reason.split(": ")[1];
  if (temporary) {
    storeReason = `[${banLength}] ${storeReason}`;
  } else {
    storeReason = `[perm] ${storeReason}`;
  }

  if (mode === "id") {
    await newCase(message.guild, "ban", userId, message.author, storeReason);
    if (temporary) {
      await newBan(message.guild, userId, unbanDate);
    }
  } else {
    await newCase(message.guild, "ban", target.user.id, message.author, storeReason);

    if (temporary) {
      await newBan(message.guild, target.user.id, unbanDate);
    }

    if (args.join(" ").includes("-s")) return;

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
        embed.setFooter({ text: "unbanned at:" });
        embed.setTimestamp(unbanDate);
      }

      await target
        .send({ content: `you have been banned from ${message.guild.name}`, embeds: [embed] })
        .catch(() => {});
    }
  }
}

cmd.setRun(run);

module.exports = cmd;

function getDuration(duration: string) {
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
