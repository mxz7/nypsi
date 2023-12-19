import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Collection,
  GuildMember,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
  PermissionsBitField,
  ThreadMember,
  ThreadMemberManager,
} from "discord.js";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { a } from "../utils/functions/anticheat";
import { userExists } from "../utils/functions/economy/utils";
import { checkAutoMute, checkMessageContent } from "../utils/functions/guilds/filters";
import { isSlashOnly } from "../utils/functions/guilds/slash";
import { getPrefix, hasGuild } from "../utils/functions/guilds/utils";
import { getKarma } from "../utils/functions/karma/karma";
import { addMuteViolation } from "../utils/functions/moderation/mute";
import { isPremium } from "../utils/functions/premium/premium";
import {
  createSupportRequest,
  getSupportRequest,
  sendToRequestChannel,
} from "../utils/functions/supportrequest";
import { isUserBlacklisted } from "../utils/functions/users/blacklist";
import { getLastCommand } from "../utils/functions/users/commands";
import { MentionQueueItem } from "../utils/functions/users/mentions";
import { runCommand } from "../utils/handlers/commandhandler";
import { logger } from "../utils/logger";
import ms = require("ms");

const dmCooldown = new Set<string>();

export default async function messageCreate(message: Message) {
  if (message.channel.isDMBased() && !message.author.bot) {
    logger.info("message in DM from " + message.author.username + ": " + message.content);

    if (await isUserBlacklisted(message.author.id))
      return message.reply({
        content: "you are blacklisted from nypsi. this punishment will not be removed.",
      });

    if (await redis.exists(`${Constants.redis.cooldown.SUPPORT}:${message.author.id}`)) {
      return message.reply({
        embeds: [
          new ErrorEmbed(
            "you have created a support request recently, try again later.\nif you need support and don't want to wait, you can join the nypsi support server [here](https://discord.gg/hJTDNST)",
          ),
        ],
      });
    }

    const request = await getSupportRequest(message.author.id);

    if (!request) {
      if (dmCooldown.has(message.author.id)) return;
      dmCooldown.add(message.author.id);

      setTimeout(() => {
        dmCooldown.delete(message.author.id);
      }, 30000);

      const embed = new CustomEmbed()
        .setHeader("support")
        .setColor(Constants.TRANSPARENT_EMBED_COLOR)
        .setDescription(
          "if you need support, join the [**official nypsi server**](https://discord.gg/hJTDNST) or click the button below to talk to a staff member. only click the button if you actually need support" +
            "\n\n**ONLY CLICK IF YOU WISH TO TALK TO A NYPSI STAFF MEMBER**",
        );

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("s")
          .setLabel("talk to a staff member")
          .setStyle(ButtonStyle.Danger),
      );

      const msg = await message.reply({
        content: "discord.gg/hJTDNST",
        embeds: [embed],
        components: [row],
      });

      const filter = (i: Interaction) => i.user.id == message.author.id;

      const res = await msg.awaitMessageComponent({ filter, time: 30000 }).catch(() => {});

      if (!res) {
        return await msg.edit({ components: [] });
      }

      if (res.customId == "s") {
        await res.deferUpdate();
        const a = await getSupportRequest(message.author.id);

        if (a) return;

        const r = await createSupportRequest(
          message.author.id,
          message.client as NypsiClient,
          message.author.username,
        );

        if (!r) {
          return res.followUp({
            embeds: [new CustomEmbed().setDescription("failed to create support request")],
          });
        } else {
          return res.followUp({
            embeds: [
              new CustomEmbed().setDescription(
                "✅ created support request, you can now talk directly to nypsi staff",
              ),
            ],
          });
        }
      }
    } else {
      const embed = new CustomEmbed()
        .setHeader(message.author.username, message.author.avatarURL())
        .setColor(Constants.TRANSPARENT_EMBED_COLOR);

      if (message.content) {
        embed.setDescription(message.content);
      }

      if (message.attachments.first()) {
        embed.setImage(message.attachments.first().url);
      }

      const res = await sendToRequestChannel(
        message.author.id,
        embed,
        message.client as NypsiClient,
      );

      if (res) {
        return await message.react("✅");
      } else {
        return await message.react("❌");
      }
    }

    const embed = new CustomEmbed()
      .setHeader("nypsi")
      .setColor(Constants.TRANSPARENT_EMBED_COLOR)
      .setDescription(
        "unfortunately you can't do commands in direct messages ):\n\n" +
          "if you need support or help for nypsi, please join the official nypsi server: https://discord.gg/hJTDNST",
      );
    return await message.channel.send({ embeds: [embed] });
  }

  a(message.author.id, message.author.username, message.content);
  if (message.channel.isDMBased()) return;
  if (message.channel.isVoiceBased()) return;
  if (!message.member) return;

  message.content = message.content.replace(/ +(?= )/g, ""); // remove any additional spaces

  let prefix = await getPrefix(message.guild);

  if (message.client.user.id == "685193083570094101") prefix = "£";

  if (
    message.content == `<@!${message.client.user.id}>` ||
    message.content == `<@${message.client.user.id}>`
  ) {
    return message.channel
      .send({ content: `my prefix for this server is \`${prefix}\`` })
      .catch(() => {
        return message.member.send({
          content: `my prefix for this server is \`${prefix}\` -- i do not have permission to send messages in that channel`,
        });
      });
  }

  if (
    (await hasGuild(message.guild)) &&
    !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)
  ) {
    const res = await checkMessageContent(message);

    if (!res) {
      addMuteViolation(message.guild, message.member);
      await checkAutoMute(message);
      return;
    }
  }

  if (message.content.startsWith(prefix) && !(await isSlashOnly(message.guild))) {
    const args = message.content.substring(prefix.length).split(" ");

    const cmd = args[0].toLowerCase();

    runCommand(cmd, message, args);
  }

  if (
    message.guild.memberCount < 150000 &&
    ((await userExists(message.guild.ownerId)) ||
      (await isPremium(message.guild.ownerId)) ||
      (await getKarma(message.guild.ownerId)) >= 10 ||
      (await getLastCommand(message.guild.ownerId)).getTime() >= Date.now() - ms("30 days"))
  ) {
    let mentionMembers: string[] = [];

    if (message.mentions.everyone) {
      if (message.guild.members.cache.size != message.guild.memberCount) {
        await message.guild.members.fetch().catch((e) => {
          logger.error("failed to fetch guild members for @everyone mention", e);
        });
      }

      let members: Collection<string, GuildMember | ThreadMember> | ThreadMemberManager =
        message.channel.members;

      if (members instanceof ThreadMemberManager) {
        members = members.cache;
      }

      mentionMembers = Array.from(members.mapValues((m) => m.user.id).values());
    } else if (message.mentions.roles.first()) {
      if (message.guild.members.cache.size != message.guild.memberCount) {
        await message.guild.members.fetch().catch((e) => {
          logger.error("failed to fetch members for role mention", e);
        });
      }

      message.mentions.roles.forEach((r) => {
        r.members.forEach((m) => {
          if (!mentionMembers.includes(m.user.id)) {
            mentionMembers.push(m.user.id);
          }
        });
      });
    }

    if (message.mentions?.members?.size > 0) {
      if (mentionMembers) {
        message.mentions.members.forEach((m) => {
          if (!mentionMembers.includes(m.user.id)) {
            mentionMembers.push(m.user.id);
          }
        });
      } else {
        mentionMembers = Array.from(message.mentions.members.mapValues((m) => m.user.id).values());
      }
    }

    if (mentionMembers.length > 0) {
      let channelMembers: Collection<string, GuildMember | ThreadMember> | ThreadMemberManager =
        message.channel.members;

      if (channelMembers instanceof ThreadMemberManager) {
        channelMembers = channelMembers.cache;
      }

      await redis.rpush(
        Constants.redis.nypsi.MENTION_QUEUE,
        JSON.stringify({
          members: mentionMembers,
          channelMembers: Array.from(channelMembers.mapValues((m) => m.user.id).values()),
          content:
            message.content.length > 100
              ? message.content.substring(0, 97) + "..."
              : message.content,
          url: message.url,
          username: message.author.username,
          date: message.createdTimestamp,
          guildId: message.guild.id,
        } as MentionQueueItem),
      );
    }
  }
}
