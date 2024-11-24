import { CommandInteraction, Message } from "discord.js";
import { sort } from "fast-sort";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { formatDate } from "../utils/functions/date";
import { getMember } from "../utils/functions/member";
import { fetchUsernameHistory } from "../utils/functions/users/history";
import { addView } from "../utils/functions/users/views";
import workerSort from "../utils/functions/workers/sort";
import { logger } from "../utils/logger";

const cmd = new Command("user", "view info about a user in the server", "info").setAliases([
  "whois",
  "who",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
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
      member.user.username,
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

  let membersSorted: { id: string; joinedTimestamp: number }[] = [];
  let msg: Message;

  if (await redis.exists(`${Constants.redis.cache.guild.JOIN_ORDER}:${message.guildId}`)) {
    membersSorted = JSON.parse(
      await redis.get(`${Constants.redis.cache.guild.JOIN_ORDER}:${message.guildId}`),
    );
  } else {
    if (members.size > 2000) {
      if (members.size > 5000)
        msg = await message.channel.send({
          embeds: [
            new CustomEmbed(
              message.member,
              `sorting ${membersSorted.length.toLocaleString()} members..`,
            ),
          ],
        });

      membersSorted = await workerSort(
        Array.from(members.map((i) => ({ id: i.id, joinedTimestamp: i.joinedTimestamp }))),
        "joinedTimestamp",
        "asc",
      );
    } else {
      membersSorted = sort(
        Array.from(members.map((i) => ({ id: i.id, joinedTimestamp: i.joinedTimestamp }))),
      ).asc((i) => i.joinedTimestamp);
    }

    await redis.set(
      `${Constants.redis.cache.guild.JOIN_ORDER}:${message.guildId}`,
      JSON.stringify(membersSorted),
      "EX",
      3600 * 3,
    );
  }

  let joinPos: number | string = membersSorted.findIndex((i) => i.id) + 1;

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
    .setHeader(member.user.username)

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
      text.push(`\`${un.value}\` | \`${formatDate(un.createdAt)}\``);
    }

    embed.addField("username history", text.join("\n"), true);
  }

  if (msg) msg.edit({ embeds: [embed] });
  else message.channel.send({ embeds: [embed] });

  addView(member.user.id, message.author.id, `user in ${message.guild.id}`);
}

cmd.setRun(run);

module.exports = cmd;
