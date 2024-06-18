import {
  CommandInteraction,
  Message,
  MessageReaction,
  PermissionFlagsBits,
  User,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { newCase } from "../utils/functions/moderation/cases";

const cmd = new Command("kicksince", "kick members that joined after a certain time", "admin")
  .setPermissions(["ADMINISTRATOR"])
  .setAliases(["fuckoffsince"]);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.channel.send({
        embeds: [new ErrorEmbed("you need the `administrator` permission")],
      });
    }
    return;
  }

  if (!message.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
    return message.channel.send({
      embeds: [new ErrorEmbed("i need the `kick members` permission for this command to work")],
    });
  }

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0 && message.mentions.members.first() == null) {
    const embed = new CustomEmbed(message.member)
      .setHeader("kicksince help")
      .addField("usage", `${prefix}kicksince <length> (reason)`)
      .addField(
        "help",
        "**<>** required | **()** optional | **[]** parameter\n" +
          "**<length>** the amount of time to traceback to before kicking\n" +
          "**(reason)** reason for the kick, will be given to all kicked members\n",
      )
      .addField("examples", `${prefix}kicksince 1h bots`)
      .addField(
        "time format examples",
        "**1d** *1 day*\n**10h** *10 hours*\n**15m** *15 minutes*\n**30s** *30 seconds*",
      );

    return message.channel.send({ embeds: [embed] });
  }

  const time = new Date().getTime() - getDuration(args[0].toLowerCase()) * 1000;

  if (!time) {
    return message.channel.send({ embeds: [new ErrorEmbed("invalid time length")] });
  } else if (time < Date.now() - 604800000 && message.author.id != message.guild.ownerId) {
    return message.channel.send({ embeds: [new ErrorEmbed("lol dont even try")] });
  } else if (time < Date.now() - 604800000 * 2) {
    return message.channel.send({ embeds: [new ErrorEmbed("lol dont even try")] });
  }

  let members = await message.guild.members.fetch();

  members = await members.filter((m) => m.joinedTimestamp >= time);

  if (members.size >= 50) {
    const confirm = await message.channel.send({
      embeds: [
        new CustomEmbed(
          message.member,
          `this will kick **${members.size.toLocaleString()}** members, are you sure?`,
        ),
      ],
    });

    await confirm.react("✅");

    const filter = (reaction: MessageReaction, user: User) => {
      return ["✅"].includes(reaction.emoji.name) && user.id == message.author.id;
    };

    const reaction = await confirm
      .awaitReactions({ filter, max: 1, time: 15000, errors: ["time"] })
      .then((collected) => {
        return collected.first().emoji.name;
      })
      .catch(async () => {
        await confirm.reactions.removeAll();
      });

    if (reaction == "✅") {
      await confirm.delete();
    } else {
      return;
    }
  }

  let status;
  let statusDesc = `\`0/${members.size}\` members kicked..`;
  let reason = message.author.username + ": ";

  if (members.size >= 15) {
    status = new CustomEmbed(
      message.member,
      statusDesc + "\n\n- if you'd like to cancel this operation, delete this message",
    );
  }

  let msg;

  if (status) {
    msg = await message.channel.send({ embeds: [status] });
  }

  if (args.length > 1) {
    args.shift();

    reason += args.join(" ");
  } else {
    reason += "no reason given";
  }

  let count = 0;
  const failed = [];
  let interval = 0;

  for (const member of members.keys()) {
    interval++;

    const targetHighestRole = members.get(member).roles.highest;
    const memberHighestRole = message.member.roles.highest;

    if (
      targetHighestRole.position >= memberHighestRole.position &&
      message.guild.ownerId != message.author.id
    ) {
      failed.push(members.get(member).user);
    } else {
      if (members.get(member).user.id == message.client.user.id) {
        continue;
      }

      await members
        .get(member)
        .kick(reason)
        .then(() => {
          count++;
        })
        .catch(() => {
          failed.push(members.get(member).user);
        });

      if (interval >= 10 && status) {
        statusDesc = `\`${count}/${members.size}\` members kicked..${
          failed.length != 0 ? `\n- **${failed.length}** failed` : ""
        }`;
        status.setDescription(
          statusDesc + "\n\n- if you'd like to cancel this operation, delete this message",
        );
        let fail = false;
        await msg.edit({ embeds: [status] }).catch(() => {
          fail = true;
        });
        if (fail) {
          return message.channel.send({
            embeds: [new CustomEmbed(message.member, "✅ operation cancelled")],
          });
        }
        interval = 0;
      }
    }
  }

  if (count == 0) {
    return message.channel.send({ embeds: [new ErrorEmbed("i was unable to kick any users")] });
  }

  const embed = new CustomEmbed(message.member);

  if (reason.split(": ")[1] == "no reason given") {
    embed.setDescription(`✅ **${count}** members kicked`);
  } else {
    embed.setDescription(`✅ **${count}** members kicked for: ${reason.split(": ")[1]}`);
  }

  if (failed.length != 0) {
    const failedTags = [];
    for (const fail1 of failed) {
      failedTags.push(fail1.username);
    }

    embed.addField("error", "unable to kick: " + failedTags.join(", "));
  }

  if (count == 1) {
    if (reason.split(": ")[1] == "no reason given") {
      embed.setDescription("✅ `" + members.first().user.username + "` has been kicked");
    } else {
      embed.setDescription(
        "✅ `" + members.first().user.username + "` has been kicked for: " + reason.split(": ")[1],
      );
    }
  }

  if (status) {
    msg.delete();
  }

  await message.channel.send({ embeds: [embed] });

  const members1 = Array.from(members.keys());

  if (failed.length != 0) {
    for (const fail of failed) {
      if (members1.includes(fail.id)) {
        members1.splice(members1.indexOf(fail.id), 1);
      }
    }
  }

  await newCase(message.guild, "kick", members1, message.author, reason.split(": ")[1]);

  for (const member of members1) {
    const m = members.get(member);

    if (reason.split(": ")[1] == "no reason given") {
      await m.send({ content: `you have been kicked from ${message.guild.name}` }).catch(() => {});
    } else {
      const embed = new CustomEmbed(m)
        .setTitle(`kicked from ${message.guild.name}`)
        .addField("reason", `\`${reason.split(": ")[1]}\``);

      await m
        .send({ content: `you have been kicked from ${message.guild.name}`, embeds: [embed] })
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
