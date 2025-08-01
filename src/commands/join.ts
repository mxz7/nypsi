import { Collection, CommandInteraction, GuildMember, Message } from "discord.js";
import { sort } from "fast-sort";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { daysAgo, formatDate } from "../utils/functions/date";
import { getMember } from "../utils/functions/member";
import { pluralize } from "../utils/functions/string";
import workerSort from "../utils/functions/workers/sort";
import { logger } from "../utils/logger";

const cmd = new Command("join", "view your join position in the server", "info").setAliases([
  "joined",
]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) =>
  option.setName("user").setDescription("view join position for this user").setRequired(false),
);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  let mode: "member" | "position" = "member";

  let member: GuildMember;

  if (args.length == 0) {
    member = message.member;
  } else if (parseInt(args[0])) {
    mode = "position";
  } else {
    member = await getMember(message.guild, args.join(" "));
  }

  if (!member && mode === "member") {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  let members: Collection<string, GuildMember>;

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

  if (mode === "position") {
    if (!membersSorted[parseInt(args[0]) - 1]) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    member = await message.guild.members.fetch(membersSorted[parseInt(args[0]) - 1].id);
  }

  const joinPos =
    mode === "position"
      ? parseInt(args[0])
      : membersSorted.findIndex((i) => i.id === member.id) + 1;

  const joinedServer = formatDate(member.joinedAt).toLowerCase();
  const timeAgo = daysAgo(new Date(member.joinedAt));

  const embed = new CustomEmbed(
    message.member,
    `joined on **${joinedServer}**\n- **${timeAgo.toLocaleString()}** ${pluralize("day", timeAgo)} ago\njoin position is **${
      joinPos !== 0 ? joinPos.toLocaleString() : "--"
    }**`,
  )
    .setTitle(member.user.username)
    .setThumbnail(member.user.displayAvatarURL({ size: 128 }));

  if (msg) msg.edit({ embeds: [embed] });
  else send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
