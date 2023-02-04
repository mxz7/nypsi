import { CommandInteraction, Message, PermissionFlagsBits } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getMember } from "../utils/functions/member";
import { getAllCases } from "../utils/functions/moderation/cases";
import { profileExists } from "../utils/functions/moderation/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("topcases", "see who has the top moderation cases", "moderation").setPermissions([
  "MANAGE_MESSAGES",
  "MODERATE_MEMBERS",
]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return;
    }
  }

  if (!(await profileExists(message.guild)))
    return message.channel.send({ embeds: [new ErrorEmbed("no data for this server")] });

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  const cases = await getAllCases(message.guild);

  if (cases.length <= 0) return message.channel.send({ embeds: [new ErrorEmbed("no data for this server")] });

  await addCooldown(cmd.name, message.member, 15);

  const embed = new CustomEmbed(message.member).setHeader("top cases");

  const prefix = await getPrefix(message.guild);

  if (args.length == 0) {
    const topStaff = new Map<string, number>();
    const topMembers = new Map<string, number>();

    let deletedCaseCount = 0;

    for (const case0 of cases) {
      if (case0.deleted) {
        deletedCaseCount++;
        continue;
      }

      if (topStaff.has(case0.moderator)) {
        topStaff.set(case0.moderator, topStaff.get(case0.moderator) + 1);
      } else {
        topStaff.set(case0.moderator, 1);
      }

      if (topMembers.has(case0.user)) {
        topMembers.set(case0.user, topMembers.get(case0.user) + 1);
      } else {
        topMembers.set(case0.user, 1);
      }
    }

    const staff = [];
    const members = [];

    for (const s of topStaff.keys()) {
      staff.push(s);
    }

    for (const m of topMembers.keys()) {
      members.push(m);
    }

    staff.sort(function (a, b) {
      return topStaff.get(b) - topStaff.get(a);
    });

    members.sort(function (a, b) {
      return topMembers.get(b) - topMembers.get(a);
    });

    const staffText = [];
    const memberText = [];

    let count = 0;

    for (const s of staff) {
      if (count >= 5) break;

      staffText[count] = count + 1 + " `" + s + "` **" + topStaff.get(s).toLocaleString() + "** punishments given";

      count++;
    }

    count = 0;

    for (const m of members) {
      if (count >= 5) break;

      let username: any = message.guild.members.cache.find((mem) => mem.id == m);

      if (!username) {
        username = m;
      } else {
        username = username.user.tag;
      }

      memberText[count] = count + 1 + " `" + username + "` **" + topMembers.get(m).toLocaleString() + "** punishments taken";

      count++;
    }

    embed.addField("top staff", staffText.join("\n"), true);
    embed.addField("top members", memberText.join("\n"), true);

    if (deletedCaseCount) {
      embed.setFooter({
        text: `${prefix}topcases <user> | ${cases.length.toLocaleString()} total cases | ${deletedCaseCount.toLocaleString()} deleted cases`,
      });
    } else {
      embed.setFooter({ text: `${prefix}topcases <user> | ${cases.length.toLocaleString()} total cases` });
    }
  } else {
    let member;

    if (message.mentions.members.first()) {
      member = message.mentions.members.first();
    } else {
      if (await message.guild.members.fetch(args[0]).catch(() => {})) {
        member = await message.guild.members.fetch(args[0]);

        if (!member) {
          return message.channel.send({
            embeds: [new ErrorEmbed("couldn't find that member")],
          });
        }
      } else {
        member = await getMember(message.guild, args.join(" "));

        if (!member) {
          return message.channel.send({
            embeds: [new ErrorEmbed("can't find `" + args.join(" ") + "`")],
          });
        }
      }
    }

    let deletedCasesModerator = 0;
    let deletedCases = 0;

    let punished = 0;
    let punishments = 0;

    let mutes = 0;
    let bans = 0;
    let kicks = 0;
    let warns = 0;
    let unbans = 0;
    let unmutes = 0;

    for (const case0 of cases) {
      if (case0.moderator == member.user.tag) {
        if (case0.deleted) {
          deletedCasesModerator++;
        } else {
          punished++;

          switch (case0.type) {
            case "mute":
              mutes++;
              break;
            case "ban":
              bans++;
              break;
            case "kick":
              kicks++;
              break;
            case "warn":
              warns++;
              break;
            case "unban":
              unbans++;
              break;
            case "unmute":
              unmutes++;
              break;
          }
        }
      } else if (case0.user == member.user.id) {
        if (case0.deleted) {
          deletedCases++;
        } else {
          punishments++;
        }
      }
    }

    embed.setDescription(member.user.toString());

    if (punished > 5) {
      embed.addField(
        "moderator stats",
        "cases `" +
          punished.toLocaleString() +
          "`\ndeleted cases `" +
          deletedCasesModerator.toLocaleString() +
          "`\nbans `" +
          bans.toLocaleString() +
          "`\nkicks `" +
          kicks.toLocaleString() +
          "`\nmutes `" +
          mutes.toLocaleString() +
          "`\nwarns `" +
          warns.toLocaleString() +
          "`\nunbans `" +
          unbans.toLocaleString() +
          "`\nunmutes `" +
          unmutes.toLocaleString() +
          "`",
        true
      );
    }
    embed.addField(
      "member stats",
      "punishments `" + punishments.toLocaleString() + "`\ndeleted `" + deletedCases.toLocaleString() + "`",
      true
    );
  }

  return await message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
