import {
  BaseMessageOptions,
  Collection,
  CommandInteraction,
  GuildMember,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { sort } from "fast-sort";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { daysAgo, formatDate } from "../utils/functions/date";
import { getMember } from "../utils/functions/member";
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
  args: string[],
) {
  let member: GuildMember;

  if (args.length == 0) {
    member = message.member;
  } else {
    member = await getMember(message.guild, args.join(" "));
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

  if (!member) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  const joinedServer = formatDate(member.joinedAt).toLowerCase();
  const timeAgo = daysAgo(new Date(member.joinedAt));

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

  let joinPos: number | string = membersSorted.findIndex((i) => i.id === member.id) + 1;

  if (joinPos == 0) joinPos = "invalid";

  const embed = new CustomEmbed(
    message.member,
    `joined on **${joinedServer}**\n- **${timeAgo.toLocaleString()}** days ago\njoin position is **${
      joinPos != "invalid" ? joinPos.toLocaleString() : "--"
    }**`,
  )
    .setTitle(member.user.username)
    .setThumbnail(member.user.displayAvatarURL({ size: 128 }));

  if (msg) msg.edit({ embeds: [embed] });
  else send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
