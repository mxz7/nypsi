import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
  PermissionFlagsBits,
  User,
} from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { PunishmentType } from "../types/Moderation";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getExactMember } from "../utils/functions/member";
import { newBan } from "../utils/functions/moderation/ban";
import { newCase } from "../utils/functions/moderation/cases";
import { createProfile, profileExists } from "../utils/functions/moderation/utils";

const cmd = new Command("ban", "ban one or more users from the server", Categories.MODERATION).setPermissions([
  "BAN_MEMBERS",
]);

cmd.slashEnabled = true;
cmd.slashData
  .addUserOption((option) => option.setName("user").setDescription("member to ban from the server").setRequired(true))
  .addStringOption((option) => option.setName("reason").setDescription("reason for the ban").setRequired(true));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
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

  let idOnly = false;
  let idUser: string;
  let id: string;

  const prefix = await getPrefix(message.guild);

  if (args.length == 0 || !args[0]) {
    const embed = new CustomEmbed(message.member)
      .setHeader("ban help")
      .addField("usage", `${prefix}ban <@user(s)> (reason) [-s]`)
      .addField(
        "help",
        "**<>** required | **()** optional | **[]** parameter\n" +
          "**<@users>** you can ban one or more members in one command (must tag them)\n" +
          "**(reason)** reason for the ban, will be given to all banned members\n" +
          "**[-s]** if used, command message will be deleted and the output will be sent to moderator as a DM if possible"
      )
      .addField(
        "examples",
        `${prefix}ban @member hacking\n${prefix}ban @member @member2 @member3 hacking\n${prefix}ban @member hacking -s\n${prefix}ban @member 1d annoying`
      );

    return send({ embeds: [embed] });
  }

  if ((await message.guild.members.fetch(args[0]).catch(() => {})) && message.mentions.members.first() == null) {
    const member = await message.guild.members.fetch(args[0]).catch(() => {});

    if (!member) {
      idOnly = true;

      id = args.shift();
    } else {
      message.mentions.members.set(member.user.id, member);
    }
  } else if (message.mentions.members.first() == null) {
    const member = await getExactMember(message.guild, args[0]);

    if (!member) {
      return send({ embeds: [new ErrorEmbed("unable to find member `" + args[0] + "`")] });
    }

    message.mentions.members.set(member.user.id, member);
  }

  const members = message.mentions.members;
  let reason = message.member.user.tag + ": ";
  let unbanDate: Date;
  let temporary = false;
  let duration;

  if (args.length != members.size && args.length != 0) {
    for (let i = 0; i < members.size; i++) {
      args.shift();
    }

    try {
      duration = getDuration(args[0].toLowerCase());
      unbanDate = new Date(Date.now() + duration * 1000);
    } catch {
      // eslint happy
    }

    if (duration) {
      temporary = true;
      args.shift();
    }

    reason = reason + args.join(" ");
  } else {
    reason = reason + "no reason given";
  }

  let count = 0;
  const failed = [];
  let fail = false;

  if (idOnly) {
    await message.guild.members
      .ban(id, {
        reason: reason,
      })
      .then((banned) => {
        if (typeof banned == "string") {
          idUser = banned;
        } else if (banned instanceof User) {
          idUser = `${banned.username}#${banned.discriminator}`;
        } else {
          idUser = `${banned.user.tag}`;
        }
        count++;
      })
      .catch(() => {
        if (idOnly) {
          fail = true;
          return send({
            embeds: [new ErrorEmbed(`unable to ban the id: \`${id}\``)],
          });
        }
        failed.push(id);
      });
  } else {
    for (const member of members.keys()) {
      const targetHighestRole = members.get(member).roles.highest;
      const memberHighestRole = message.member.roles.highest;

      if (targetHighestRole.position >= memberHighestRole.position && message.guild.ownerId != message.member.user.id) {
        failed.push(members.get(member).user);
        continue;
      }

      if (members.get(member).user.id == message.client.user.id) {
        await send({ content: "well... i guess this is goodbye ):" });
        await message.guild.leave();
        return;
      }

      await message.guild.members
        .ban(member, {
          reason: reason,
        })
        .then(() => {
          count++;
        })
        .catch(() => {
          if (idOnly) {
            fail = true;
            return send({
              embeds: [new ErrorEmbed(`unable to ban the id: \`${member}\``)],
            });
          }
          failed.push(members.get(member).user);
        });
    }
  }

  if (fail) return;

  if (count == 0) {
    return send({ embeds: [new ErrorEmbed("i was unable to ban any users")] });
  }

  let banLength = "";

  const embed = new CustomEmbed(message.member).setDescription(
    "✅ **" + count + "** members banned for: " + reason.split(": ")[1]
  );

  if (temporary) {
    banLength = getTime(duration * 1000);
    embed.setDescription(`✅ **${count}** members banned for: **${banLength}**`);
  } else if (reason.split(": ")[1] == "no reason given") {
    embed.setDescription(`✅ **${count}** members banned`);
  } else {
    embed.setDescription(`✅ **${count}** members banned for: ${reason.split(": ")[1]}`);
  }

  if (count == 1 && failed.length == 0) {
    if (idOnly) {
      if (temporary) {
        embed.setDescription(`✅ \`${idUser}\` has been banned for: **${banLength}**`);
      } else if (reason.split(": ")[1] == "no reason given") {
        embed.setDescription(`✅ \`${idUser}\` has been banned`);
      } else {
        embed.setDescription(`✅ \`${idUser}\` has been banned for: ${reason.split(": ")[1]}`);
      }
    } else {
      if (temporary) {
        embed.setDescription(`✅ \`${members.first().user.tag}\` has been banned for: **${banLength}**`);
      } else if (reason.split(": ")[1] == "no reason given") {
        embed.setDescription("✅ `" + members.first().user.tag + "` has been banned");
      } else {
        embed.setDescription("✅ `" + members.first().user.tag + "` has been banned for: " + reason.split(": ")[1]);
      }
    }
  }

  if (failed.length != 0) {
    const failedTags = [];
    for (const fail1 of failed) {
      failedTags.push(fail1.tag);
    }

    embed.addField("error", "unable to ban: " + failedTags.join(", "));
  }

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

  if (idOnly) {
    await newCase(message.guild, PunishmentType.BAN, id, message.member.user.tag, reason.split(": ")[1]);
    if (temporary) {
      await newBan(message.guild, id, unbanDate);
    }
  } else {
    const members1 = Array.from(members.keys());

    if (failed.length != 0) {
      for (const fail of failed) {
        if (members1.includes(fail.id)) {
          members1.splice(members1.indexOf(fail.id), 1);
        }
      }
    }

    await newCase(message.guild, PunishmentType.BAN, members1, message.author.tag, reason.split(": ")[1]);

    if (temporary) {
      await newBan(message.guild, members1, unbanDate);
    }

    if (args.join(" ").includes("-s")) return;
    for (const member of members1) {
      const m = members.get(member);

      if (reason.split(": ")[1] == "no reason given") {
        await m
          .send({
            content: `you have been banned from ${message.guild.name}${temporary ? `\n\nexpires in **${banLength}**}` : ""}`,
          })
          .catch(() => {});
      } else {
        const embed = new CustomEmbed(m)
          .setTitle(`banned from ${message.guild.name}`)
          .addField("reason", `\`${reason.split(": ")[1]}\``, true);

        if (temporary) {
          embed.addField("length", `\`${banLength}\``, true);
          embed.setFooter({ text: "unbanned at:" });
          embed.setTimestamp(unbanDate);
        }

        await m.send({ content: `you have been banned from ${message.guild.name}`, embeds: [embed] }).catch(() => {});
      }
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
