import { CommandInteraction, Message, PermissionFlagsBits, User } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";

import prisma from "../init/database";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { getMember } from "../utils/functions/member";
import { getCaseCount } from "../utils/functions/moderation/cases";
import { getLastKnownUsername } from "../utils/functions/users/tag";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command(
  "topcases",
  "see who has the top moderation cases",
  "moderation",
).setPermissions(["MANAGE_MESSAGES", "MODERATE_MEMBERS"]);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return;
    }
  }

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  async function allUsers() {
    const [moderators, users, types, count] = await Promise.all([
      prisma.moderationCase.groupBy({
        where: {
          guildId: message.guildId,
        },
        by: ["moderator"],
        _count: true,
        orderBy: {
          _count: { caseId: "desc" },
        },
      }),
      prisma.moderationCase.groupBy({
        where: {
          guildId: message.guildId,
        },
        by: ["user"],
        _count: true,
        orderBy: {
          _count: { caseId: "desc" },
        },
      }),
      prisma.moderationCase.groupBy({
        where: {
          guildId: message.guildId,
        },
        by: ["type"],
        _count: true,
        orderBy: {
          _count: { caseId: "desc" },
        },
      }),
      getCaseCount(message.guild),
    ]);

    if (moderators.length === 0)
      return message.channel.send({ embeds: [new ErrorEmbed("no data")] });

    const moderatorsText: string[] = [];
    const usersText: string[] = [];
    const typeText: string[] = [];

    for (const mod of moderators) {
      if (moderatorsText.length >= 10) break;

      let username = mod.moderator;

      if (username.match(Constants.SNOWFLAKE_REGEX))
        username = (await getLastKnownUsername(username)) || mod.moderator;

      moderatorsText.push(`\`${username}\` **${mod._count.toLocaleString()}**`);
    }

    for (const user of users) {
      if (usersText.length >= 10) break;

      const username = (await getLastKnownUsername(user.user)) || user.user;

      usersText.push(`\`${username}\` **${user._count.toLocaleString()}**`);
    }

    for (const type of types) {
      typeText.push(`\`${type.type}\` **${type._count.toLocaleString()}**`);
    }

    const embed = new CustomEmbed(message.member)
      .setFooter({ text: `${count.toLocaleString()} total cases` })
      .setHeader(`${message.guild.name} case stats`, message.guild.iconURL());

    if (moderatorsText.length > 0) embed.addField("given", moderatorsText.join("\n"), true);
    if (usersText.length > 0) embed.addField("received", usersText.join("\n"), true);
    if (typeText.length > 0) embed.addField("types", typeText.join("\n"), true);

    return message.channel.send({ embeds: [embed] });
  }

  async function specificUser(user: User) {
    const [given, received] = await Promise.all([
      prisma.moderationCase.groupBy({
        where: { AND: [{ guildId: message.guildId }, { moderator: user.id }] },
        by: ["type"],
        _count: true,
        orderBy: {
          _count: {
            caseId: "desc",
          },
        },
      }),
      prisma.moderationCase.groupBy({
        where: { AND: [{ guildId: message.guildId }, { user: user.id }] },
        by: ["type"],
        _count: true,
        orderBy: {
          _count: {
            caseId: "desc",
          },
        },
      }),
    ]);

    if (given.length === 0 && received.length === 0)
      return message.channel.send({ embeds: [new ErrorEmbed("no data")] });

    const givenText: string[] = [];
    const receivedText: string[] = [];

    for (const givenCase of given) {
      givenText.push(`\`${givenCase.type}\` **${givenCase._count.toLocaleString()}**`);
    }

    for (const receivedCase of received) {
      receivedText.push(`\`${receivedCase.type}\` **${receivedCase._count.toLocaleString()}**`);
    }

    const embed = new CustomEmbed(message.member, user.toString()).setHeader(
      `${message.guild.name} case stats`,
      message.guild.iconURL(),
    );

    if (givenText.length > 0) embed.addField("given", givenText.join("\n"), true);
    if (receivedText.length > 0) embed.addField("received", receivedText.join("\n"), true);

    return message.channel.send({ embeds: [embed] });
  }

  await addCooldown(cmd.name, message.member, 15);

  if (args.length === 0) {
    return allUsers();
  } else {
    const target = await getMember(message.guild, args.join(" "));

    if (!target) return message.channel.send({ embeds: [new ErrorEmbed("invalid member")] });

    return specificUser(target.user);
  }
}

cmd.setRun(run);

module.exports = cmd;
