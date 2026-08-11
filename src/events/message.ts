import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Embed,
  EmbedBuilder,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
  PermissionsBitField,
  TextChannel,
} from "discord.js";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { Mention, MentionJobData } from "../types/workers/mentions";
import Constants from "../utils/Constants";
import { isHelpChatAvailable } from "../utils/functions/ai/help-chat";
import { a } from "../utils/functions/anticheat";
import { addProgress } from "../utils/functions/economy/achievements";
import { addEventProgress } from "../utils/functions/economy/events";
import { handleLootDropMessage } from "../utils/functions/economy/loot-drops";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import { userExists } from "../utils/functions/economy/utils";
import {
  trackCmdChannelActivity,
  trackCmdChannelLoad,
} from "../utils/functions/guilds/cmd-channels";
import { getLastCommand as getLastGuildCommand } from "../utils/functions/guilds/commands";
import { checkAutoMute, checkMessageContent } from "../utils/functions/guilds/filters";
import { addToMessageCache } from "../utils/functions/guilds/messages";
import { isSlashOnly } from "../utils/functions/guilds/slash";
import { getGuildName, getPrefix, hasGuild } from "../utils/functions/guilds/utils";
import { isScamImage } from "../utils/functions/image";
import { checkTriggers } from "../utils/functions/message-triggers";
import { checkNypsiChatMessage } from "../utils/functions/nypsi/chat-spam";
import sleep from "../utils/functions/sleep";
import {
  getSupportRequest,
  handleAttachments,
  openSupportRequest,
  sendToRequestChannel,
} from "../utils/functions/supportrequest";
import { createAuraTransaction } from "../utils/functions/users/aura";
import { isUserBlacklisted } from "../utils/functions/users/blacklist";
import { getLastCommand } from "../utils/functions/users/commands";
import { getLastKnownUsername } from "../utils/functions/users/username";
import { hasProfile } from "../utils/functions/users/utils";
import {
  ResolvedMessageCommand,
  resolveMessageCommand,
  runMessageCommand,
} from "../utils/handlers/commandhandler";
import { logger } from "../utils/logger";
import { mentionQueue } from "../utils/queues/queues";
import ms = require("ms");

const dmCooldown = new Set<string>();
const brainrotFilter = [
  "skibidi",
  "gyatt",
  "sigma",
  "rizzler",
  "gooning",
  "l + ratio",
  "ohio",
  "fanum tax",
  "mewing",
  "sussy",
  "baka",
  "goofy ahh",
  "chungus",
  "bing chilling",
  "only in ohio",
  "edging",
  "bussing",
  "grimace shake",
  "whats up chat",
  "mogging",
  "hawk tua",
  "67",
  "mogged",
  "based",
  "lock in",
  "aura farm",
  "crash out",
  "tweaking",
  "tweak out",
];

let processedCount = 0;

setInterval(() => {
  logger.info(`processed messages: ${processedCount.toLocaleString()} last minute`);
  processedCount = 0;
}, 60000);

const removeExtraSpacesRegex = / +(?= )/g;

export default async function messageCreate(message: Message) {
  if (message.partial) await message.fetch();

  trackCmdChannelActivity(message.channel, "message", message.id);
  if (!message.author.bot) trackCmdChannelLoad(message.channel, message.id, "message");

  if (!message.channel.isSendable()) return;

  void handleLootDropMessage(message).catch((error) =>
    logger.error("lootdrop: message handler failed", {
      channelId: message.channelId,
      error,
      messageId: message.id,
      userId: message.author.id,
    }),
  );

  if (message.channel.isDMBased() && !message.author.bot) {
    logger.info("message in DM from " + message.author.username + ": " + message.content);

    if (message.system) return;

    const blacklist = await isUserBlacklisted(message.author.id);

    if (blacklist.blacklisted) {
      let content = "you are blacklisted from nypsi. this punishment will not be removed.";

      if (blacklist.relation !== message.author.id)
        content += `\n\n in relation to \`${blacklist.relation}\` (${await getLastKnownUsername(blacklist.relation)})`;

      return message.reply({
        content,
      });
    }

    const request = await getSupportRequest(message.author.id);

    if (!request) {
      if (dmCooldown.has(message.author.id)) return;
      dmCooldown.add(message.author.id);

      setTimeout(() => {
        dmCooldown.delete(message.author.id);
      }, 30000);

      const embed = new CustomEmbed(message.author.id)
        .setHeader("support")
        .setDescription(
          `if you need support, join the [**official nypsi server**](${Constants.NYPSI_SERVER_INVITE_LINK}) or click the button below to talk to a staff member` +
            "\n\nthis is **NOT** support for if you have been punished in an unrelated server" +
            "\n\n**ONLY CLICK IF YOU WISH TO TALK TO A NYPSI STAFF MEMBER**",
        );

      const aiAvailable = await isHelpChatAvailable();

      const rowComponents: ButtonBuilder[] = [];

      if (aiAvailable) {
        rowComponents.push(
          new ButtonBuilder()
            .setCustomId("btn-help-ai-start")
            .setLabel("ask ai for help")
            .setStyle(ButtonStyle.Primary),
        );
      }

      rowComponents.push(
        new ButtonBuilder()
          .setCustomId("btn-contact-support")
          .setLabel("talk to a staff member")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("view your active punishments")
          .setURL("https://nypsi.xyz/me/punishments?ref=bot-dm"),
      );

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        ...rowComponents,
      );

      const msg = await message.reply({
        content: Constants.NYPSI_SERVER_INVITE_LINK,
        embeds: [embed],
        components: [row],
      });

      const filter = (i: Interaction) => i.user.id == message.author.id;

      const res = await msg.awaitMessageComponent({ filter, time: 30000 }).catch(() => {});

      if (!res) {
        row.components[0].setDisabled(true);
        return await msg.edit({ components: [row] });
      }

      if (res.customId == "btn-contact-support") {
        await openSupportRequest(res as ButtonInteraction, message.client as NypsiClient);
        return;
      }
    } else {
      if (await redis.exists(`${Constants.redis.cooldown.SUPPORT_MESSAGE}:${message.author.id}`)) {
        return message.reply({
          embeds: [
            new ErrorEmbed(
              "you have recently sent a message to your support request, please wait before sending another one.\n\n" +
                "larger and fewer messages keeps it easy to read for our staff",
            ),
          ],
        });
      }

      if (message.messageSnapshots.size == 0)
        await redis.set(
          `${Constants.redis.cooldown.SUPPORT_MESSAGE}:${message.author.id}`,
          1,
          "EX",
          3,
        );

      const embed = new CustomEmbed()
        .setHeader(message.author.username, message.author.avatarURL())
        .setColor("#111111");

      if (message.content) {
        embed.setDescription(message.content);
      }

      if (message.attachments.size > 0) {
        const attachments = await handleAttachments(message.attachments);

        if (attachments === "too big")
          return message.channel.send({
            embeds: [new ErrorEmbed("cannot upload file larger than 100mb")],
          });

        embed.addField("attachments", attachments.join("\n"));
      }

      let forwardedEmbeds: Embed[];

      if (message.messageSnapshots.size > 0) {
        const snapshot = message.messageSnapshots.first();

        const guildId = snapshot.guildId;
        const channelId = snapshot.channelId;
        const messageId = snapshot.id;

        const res = guildId && (await hasGuild(guildId));

        let name = res ? await getGuildName(guildId) : (guildId ?? "DM");

        if (res) {
          const channelName = snapshot.guild?.channels?.cache.get(channelId).name ?? undefined;
          if (channelName) name += ` - #${channelName}`;
        }

        if (guildId && channelId && messageId) {
          embed.setURL(`https://discord.com/channels/${guildId}/${channelId}/${messageId}`);
        }

        embed.setTitle(`forward (${name})`);
        if (snapshot.content) embed.setDescription(`${snapshot.content}`);

        if (snapshot.attachments.size > 0) {
          const attachments = await handleAttachments(snapshot.attachments);

          if (attachments === "too big")
            return message.channel.send({
              embeds: [new ErrorEmbed("cannot upload file larger than 100mb")],
            });

          embed.addField("forwarded attachments", attachments.join("\n"));
        }

        if (snapshot.embeds.length) {
          forwardedEmbeds = snapshot.embeds;
        }
      }

      const res = await sendToRequestChannel(
        message.author.id,
        embed,
        message.author.id,
        message.client as NypsiClient,
        forwardedEmbeds,
      );

      if (res) {
        return await message.react("✅");
      } else {
        return await message.react("❌");
      }
    }

    const embed = new CustomEmbed(message.author.id)
      .setHeader("nypsi")
      .setDescription(
        "unfortunately you can't do commands in direct messages ):\n\n" +
          `if you need support or help for nypsi, please join the official nypsi server: ${Constants.NYPSI_SERVER_INVITE_LINK}`,
      );
    return await message.channel.send({ embeds: [embed] });
  }

  processedCount++;

  a(message.author.id, message.author.username, message.content);
  if (message.channel.isDMBased()) return;
  if (message.channel.isVoiceBased()) return;
  if (!message.member) return;

  message.content = message.content.replace(removeExtraSpacesRegex, ""); // remove any additional spaces
  const lowercaseContent = message.content.toLowerCase();

  const prefixes = await getPrefix(message.guild);

  if (message.client.user.id == "685193083570094101") prefixes.push("£");

  const slashOnly = await isSlashOnly(message.guild);
  const commandPrefix = slashOnly
    ? undefined
    : prefixes.find((prefix) => message.content.startsWith(prefix));
  const commandName = commandPrefix
    ? message.content.substring(commandPrefix.length).split(" ")[0].toLowerCase()
    : undefined;
  const commandArgs = commandPrefix
    ? message.content.substring(commandPrefix.length).split(" ")
    : undefined;
  const resolvedCommand: ResolvedMessageCommand =
    commandName !== undefined
      ? await resolveMessageCommand(commandName, message as NypsiMessage, commandArgs)
      : undefined;
  const commandMessage = resolvedCommand && ["built-in", "premium"].includes(resolvedCommand.type);

  const checkTask = async () => {
    await sleep(500);

    if (message.author.id === Constants.OWNER_ID) redis.set("nypsi:owner:lastchat", Date.now());

    if (
      (message.channel as TextChannel).parentId === "1246516186171314337" &&
      message.content.includes(`<@${Constants.OWNER_ID}>`) &&
      parseInt(await redis.get("nypsi:owner:lastchat")) < Date.now() - ms("15 minutes")
    ) {
      message.reply({
        content: message.author.toString(),
        embeds: [
          new EmbedBuilder()
            .setColor(Constants.EMBED_FAIL_COLOR)
            .setDescription(
              "max doesn't receive notifications for this channel\n\n" +
                "if it is urgent, dm nypsi to create a support request, or use <#747056029795221516>",
            ),
        ],
      });
    }

    addProgress(message.author.id, "yapper", 1);
    addTaskProgress(message.author.id, "chat_daily");
    addTaskProgress(message.author.id, "chat_weekly");
    addEventProgress(message.client as NypsiClient, message.member, "messages", 1);

    if (!commandMessage) await checkNypsiChatMessage(message);
  };

  const checkNeedSupport = async () => {
    const response = await checkTriggers(message.author.id, message.content);

    if (response) {
      message.reply({ embeds: [response] });
    }
  };

  const checkAura = async () => {
    if (
      (await hasProfile(message.member)) &&
      ((await getLastCommand(message.member)) || new Date(0)).getTime() > Date.now() - ms("1 day")
    ) {
      for (const brainrot of brainrotFilter) {
        if (lowercaseContent.includes(brainrot)) {
          const amounts = [5, 10, 25, 50, 75];
          const chosen = amounts[Math.floor(Math.random() * amounts.length)];

          createAuraTransaction(message.author.id, message.client.user.id, -chosen);

          redis.set(`brainrot:cooldown:${message.channelId}`, 1, "EX", 30);
        }
      }
    }
  };

  if (
    (message.author.bot && Constants.WHITELISTED_BOTS.includes(message.author.id)) ||
    !message.author.bot
  ) {
    if (message.guildId === Constants.NYPSI_SERVER_ID) {
      setTimeout(async () => {
        checkNeedSupport();
        checkTask();
        checkAura();

        if (message.attachments.size > 0) {
          for (const attachment of message.attachments.values()) {
            if (!attachment.contentType?.startsWith("image/")) continue;

            try {
              const result = await isScamImage(attachment.url);
              if (result.scam) {
                logger.info("scamtest: image detected", {
                  url: attachment.url,
                  messageUrl: message.url,
                  user: {
                    id: message.author.id,
                    username: message.author.username,
                  },
                  result,
                });
              } else {
                logger.debug("scamtest: image not detected", { url: attachment.url, result });
              }
            } catch (error) {
              logger.warn("failed to check scam image", { error, url: attachment.url });
            }
          }
        }
      }, 1000);
    }
  }

  if (
    (await hasGuild(message.guild)) &&
    !message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages)
  ) {
    const res = await checkMessageContent(message.guild, message.content, true, message);

    if (!res) {
      checkAutoMute(message);
      return;
    }
  }

  // for snipe/esnipe
  addToMessageCache(message);

  if (
    message.content == `<@!${message.client.user.id}>` ||
    message.content == `<@${message.client.user.id}>`
  ) {
    if (message.client.user.id == "685193083570094101") prefixes.push("£");

    return message.channel
      .send({ content: `my prefixes for this server: \`${prefixes.join("` `")}\`` })
      .catch(() => {
        return message.member.send({
          content: `my prefixes for this server: \`${prefixes.join("` `")}\` -- i do not have permission to send messages in that channel`,
        });
      });
  }

  if (resolvedCommand) runMessageCommand(resolvedCommand, message as NypsiMessage);

  if (
    message.mentions.everyone ||
    message.mentions.roles.size > 0 ||
    message.mentions.members?.size > 0
  ) {
    if (
      message.guild.memberCount < 50000 &&
      ((await getLastGuildCommand(message.guildId)) || new Date(0)).getTime() >=
        Date.now() - ms("30 days") &&
      (await userExists(message.guild.ownerId))
    ) {
      const channel = message.channel;

      if (!channel.isTextBased()) return;

      const payload: MentionJobData = {
        channelId: message.channelId,
        content:
          message.content.length > 100 ? message.content.substring(0, 97) + "..." : message.content,
        guildId: message.guildId,
        channelOverwrites: channel.isThread() ? null : channel.permissionOverwrites.cache.toJSON(),
        roles: message.guild.roles.cache
          .map((r) => ({
            id: r.id,
            permissions: r.permissions.bitfield.toString(),
          }))
          .filter((r) => r.permissions !== "0"),
        messageUrl: message.url,
        mentions: [],
        messageId: message.id,
        username: message.author.username,
        date: message.createdTimestamp,
      };

      if (message.mentions.everyone) {
        payload.mentions.push("everyone");
      } else {
        if (message.mentions.roles.size > 0) {
          payload.mentions.push(...message.mentions.roles.map((r) => `role:${r.id}` as Mention));
        }

        if (message.mentions.members?.size > 0) {
          payload.mentions.push(...message.mentions.members.map((m) => `user:${m.id}` as Mention));
        }
      }

      mentionQueue.add(`${message.channelId}:${message.author.id}:${message.id}`, payload, {
        attempts: 5,
        backoff: { type: "exponential", delay: 300000 },
      });
    }
  }
}
