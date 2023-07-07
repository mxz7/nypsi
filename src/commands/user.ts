import { CommandInteraction, Message } from "discord.js";
import { inPlaceSort } from "fast-sort";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { formatDate } from "../utils/functions/date";

import { getMember } from "../utils/functions/member";
import { fetchUsernameHistory } from "../utils/functions/users/history";
import workerSort from "../utils/functions/workers/sort";
import { logger } from "../utils/logger";

const cmd = new Command("user", "view info about a user in the server", "info").setAliases([
  "whois",
  "who",
]);

const sortCache = new Map<string, string[]>();

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  let member;

  if (args.length == 0) {
    member = message.member;
  } else {
    member = await getMember(message.guild, args.join(" ").replace("-id", ""));
  }

  if (!member) {
    return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if (args.includes("-id")) {
    const embed = new CustomEmbed(message.member, "`" + member.user.id + "`").setHeader(
      member.user.tag,
    );
    return message.channel.send({ embeds: [embed] });
  }

  let members;

  if (message.guild.memberCount == message.guild.members.cache.size) {
    members = message.guild.members.cache;
  } else {
    members = await message.guild.members.fetch().catch((e) => {
      logger.error("failed to fetch members for join position", e);
      return message.guild.members.cache;
    });
  }

  let membersSorted: string[] = [];

  if (
    sortCache.has(message.guild.id) &&
    sortCache.get(message.guild.id).length == message.guild.memberCount
  ) {
    membersSorted = sortCache.get(message.guild.id);
  } else if (message.guild.memberCount < 69420) {
    const membersMap = new Map<string, number>();

    members.forEach((m) => {
      if (m.joinedTimestamp) {
        membersSorted.push(m.id);
        membersMap.set(m.id, m.joinedTimestamp);
      }
    });

    if (membersSorted.length > 1000) {
      const msg = await message.channel.send({
        embeds: [
          new CustomEmbed(
            message.member,
            `sorting ${membersSorted.length.toLocaleString()} members..`,
          ),
        ],
      });
      membersSorted = await workerSort(membersSorted, membersMap);
      await msg.delete();
    } else {
      inPlaceSort(membersSorted).asc((i) => membersMap.get(i));
    }

    sortCache.set(message.guild.id, membersSorted);

    setTimeout(() => sortCache.delete(message.guild.id), 60000 * 10);
  }

  let joinPos: number | string = membersSorted.indexOf(member.id) + 1;

  if (joinPos == 0) joinPos = "invalid";

  const joined = formatDate(member.joinedAt);
  const created = formatDate(member.user.createdAt);
  const roles = member.roles.cache;

  let rolesText: string[] = [];

  roles.forEach((role) => {
    if (role.name == "@everyone") return;
    rolesText[role.position] = role.toString();
  });

  rolesText = rolesText.reverse();

  const usernameHistory = await fetchUsernameHistory(member, 5);

  const embed = new CustomEmbed(message.member, member.user.toString())
    .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
    .setHeader(member.user.tag)

    .addField(
      "account",
      `**id** ${member.user.id}\n**created** ${created.toString().toLowerCase()}`,
      true,
    )

    .addField(
      "server",
      `**joined** ${joined.toString().toLowerCase()}\n**join pos** ${
        joinPos != "invalid" ? joinPos.toLocaleString() : "--"
      }`,
      true,
    )

    .addField("\u200B", "\u200B", true);

  if (member.roles.cache.size > 1) {
    embed.addField("roles [" + (member.roles.cache.size - 1) + "]", rolesText.join(" "), true);
  }

  if (usernameHistory.length > 1) {
    const text: string[] = [];

    for (const un of usernameHistory) {
      if (text.length > 5) break;
      text.push(`\`${un.value}\` | \`${formatDate(un.date)}\``);
    }

    embed.addField("username history", text.join("\n"), true);
  }

  message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
