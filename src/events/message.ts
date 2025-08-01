import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Collection,
  Embed,
  EmbedBuilder,
  GuildMember,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  PermissionsBitField,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  ThreadMember,
  ThreadMemberManager,
} from "discord.js";
import { compareTwoStrings } from "string-similarity";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { a } from "../utils/functions/anticheat";
import { addEventProgress } from "../utils/functions/economy/events";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import { userExists } from "../utils/functions/economy/utils";
import { checkAutoMute, checkMessageContent } from "../utils/functions/guilds/filters";
import { isSlashOnly } from "../utils/functions/guilds/slash";
import { getGuildName, getPrefix, hasGuild } from "../utils/functions/guilds/utils";
import { getKarma } from "../utils/functions/karma/karma";
import { isPremium } from "../utils/functions/premium/premium";
import sleep from "../utils/functions/sleep";
import {
  createSupportRequest,
  getQuickSupportResponse,
  getSupportRequest,
  handleAttachments,
  isRequestSuitable,
  sendToRequestChannel,
} from "../utils/functions/supportrequest";
import { createAuraTransaction } from "../utils/functions/users/aura";
import { isUserBlacklisted } from "../utils/functions/users/blacklist";
import { getLastCommand } from "../utils/functions/users/commands";
import { MentionQueueItem } from "../utils/functions/users/mentions";
import { getLastKnownUsername } from "../utils/functions/users/tag";
import { hasProfile } from "../utils/functions/users/utils";
import { runCommand } from "../utils/handlers/commandhandler";
import { logger } from "../utils/logger";
import ms = require("ms");

const dmCooldown = new Set<string>();
const lastContent = new Map<string, { history: string[]; last: number }>();

setInterval(() => {
  lastContent.clear();
}, ms("30 minutes"));

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
];

const helpContent = [
  "i need help",
  "i need mod",
  "i need staff",
  "help me staff",
  "who is owner",
  "help me owner",
  "i got scammed",
  "i found a glitch",
  "i found a bug",
  "i found a problem",
  "i need support",
];
const helpCooldown = new Set<string>();

export default async function messageCreate(message: Message) {
  if (!message.channel.isSendable()) return;

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

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("s")
          .setLabel("talk to a staff member")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("view your active punishments")
          .setURL("https://nypsi.xyz/me/punishments?ref=bot-dm"),
      );

      const msg = await message.reply({
        content: Constants.NYPSI_SERVER_INVITE_LINK,
        embeds: [embed],
        components: [row],
      });

      const modal = new ModalBuilder()
        .setCustomId("support_ticket")
        .setTitle("nypsi support request")
        .addComponents(
          new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("ticket_message")
              .setLabel("message")
              .setPlaceholder("what do you need help with?")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMinLength(15)
              .setMaxLength(300),
          ),
        );

      const filter = (i: Interaction) => i.user.id == message.author.id;

      const res = await msg.awaitMessageComponent({ filter, time: 30000 }).catch(() => {});

      if (!res) {
        row.components[0].setDisabled(true);
        return await msg.edit({ components: [row] });
      }

      if (res.customId == "s") {
        if (await redis.exists(`${Constants.redis.cooldown.SUPPORT}:${message.author.id}`)) {
          return res.reply({
            embeds: [
              new ErrorEmbed(
                `you have created a support request recently, try again later.\nif you need support and don't want to wait, you can join the nypsi support server [here](${Constants.NYPSI_SERVER_INVITE_LINK})`,
              ),
            ],
          });
        }

        await res.showModal(modal);

        const modalSubmit = await res.awaitModalSubmit({ filter, time: 300000 }).catch(() => {});

        if (!modalSubmit) return;
        if (!modalSubmit.isModalSubmit()) return;

        await modalSubmit.deferReply();

        const helpMessage = modalSubmit.fields.fields.first().value;

        const a = await getSupportRequest(message.author.id);

        if (a) return;

        const aiResponse = await isRequestSuitable(helpMessage);

        logger.info(
          `supportrequest: ${message.author.id} (${message.author.username}) ai response`,
          { content: helpMessage, aiResponse },
        );

        if (!aiResponse.decision) {
          return modalSubmit.editReply({
            embeds: [
              new CustomEmbed()
                .setDescription(
                  "this isn't suitable for a support request. try including more information about what you need help with",
                )
                .setFooter({
                  text: "this is an automated system, please let us know of any issues",
                }),
            ],
          });
        }

        const quickResponse = await getQuickSupportResponse(helpMessage);

        const r = await createSupportRequest(
          message.author.id,
          message.client as NypsiClient,
          message.author.username,
        );

        if (!r) {
          return modalSubmit.editReply({
            embeds: [new CustomEmbed().setDescription("failed to create support request")],
          });
        }

        const embed = new CustomEmbed()
          .setHeader(message.author.username, message.author.avatarURL())
          .setColor("#111111");

        embed.setDescription(helpMessage);

        await sendToRequestChannel(
          message.author.id,
          embed,
          message.author.id,
          message.client as NypsiClient,
        );

        await modalSubmit.editReply({
          embeds: [
            new CustomEmbed().setDescription(
              "✅ created support request, anything you send while this is open will be sent directly to nypsi staff",
            ),
          ],
        });

        if (quickResponse) {
          const embed = new CustomEmbed()
            .setHeader("nypsi", message.client.user.avatarURL())
            .setColor(Constants.PURPLE)
            .setDescription(quickResponse)
            .setFooter({
              text: "this is an automatic message. please tell us if this doesn't match your query",
            });

          sendToRequestChannel(
            message.author.id,
            embed,
            message.author.id,
            message.client as NypsiClient,
          );
          modalSubmit.followUp({
            embeds: [embed],
            content: "you have received a message from your support ticket",
          });
        } else if (aiResponse.answer) {
          const embed = new CustomEmbed()
            .setHeader("nypsi", message.client.user.avatarURL())
            .setColor(Constants.PURPLE)
            .setDescription(aiResponse.answer)
            .setFooter({
              text: "this is an automatic message. please tell us if this doesn't match your query",
            });

          sendToRequestChannel(
            message.author.id,
            embed,
            message.author.id,
            message.client as NypsiClient,
          );
          modalSubmit.followUp({
            embeds: [embed],
            content: "you have received a message from your support ticket",
          });
        }

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

  a(message.author.id, message.author.username, message.content);
  if (message.channel.isDMBased()) return;
  if (message.channel.isVoiceBased()) return;
  if (!message.member) return;

  const checkTask = async () => {
    await sleep(500);

    const lastContents = lastContent.get(message.author.id);

    if (message.author.id === Constants.TEKOH_ID) redis.set("nypsi:tekoh:lastchat", Date.now());

    if (
      (message.channel as TextChannel).parentId === "1246516186171314337" &&
      message.content.includes(`<@${Constants.TEKOH_ID}>`) &&
      parseInt(await redis.get("nypsi:tekoh:lastchat")) < Date.now() - ms("15 minutes")
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

    const addProgress = async () => {
      await addTaskProgress(message.author.id, "chat_daily");
      await addTaskProgress(message.author.id, "chat_weekly");
      addEventProgress(message.client as NypsiClient, message.member, "messages", 1);
    };

    if (!lastContents) {
      lastContent.set(message.author.id, {
        history: [message.content.toLowerCase()],
        last: Date.now(),
      });
    } else {
      let fail = false;

      if (lastContents.last > Date.now() - 2500) {
        fail = true;
      } else {
        for (const content of lastContents.history) {
          const similarity = compareTwoStrings(content, message.content.toLowerCase());

          if (similarity > 80) {
            fail = true;
            break;
          }
        }
      }

      lastContents.history.push(message.content.toLowerCase());
      lastContents.last = Date.now();
      if (lastContents.history.length >= 3) lastContents.history.shift();

      lastContent.set(message.author.id, lastContents);

      if (fail) return;
    }

    addProgress();
  };

  const checkNeedSupport = async () => {
    if (helpCooldown.has(message.author.id)) return;
    if (message.member.roles.cache.has("1310619772714614825")) return;

    for (const i of helpContent) {
      if (message.content.toLowerCase().includes(i)) {
        helpCooldown.add(message.author.id);
        setTimeout(() => {
          helpCooldown.delete(message.author.id);
        }, 60000);
        return message.reply({
          embeds: [
            new CustomEmbed(
              message.member,
              `need help? you can dm ${message.client.user.toString()} to create a support request and talk directly to staff`,
            ),
          ],
          content: message.member.toString(),
        });
      }
    }
  };

  const checkAura = async () => {
    if (
      (await hasProfile(message.member)) &&
      (await getLastCommand(message.member)).getTime() > Date.now() - ms("1 day")
    ) {
      for (const brainrot of brainrotFilter) {
        if (message.content.toLowerCase().includes(brainrot)) {
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
      setTimeout(() => {
        checkNeedSupport();
        checkTask();
        checkAura();
      }, 1000);
    }
  }

  message.content = message.content.replace(/ +(?= )/g, ""); // remove any additional spaces

  const prefixes = await getPrefix(message.guild);

  if (message.client.user.id == "685193083570094101") prefixes.push("£");

  if (
    message.content == `<@!${message.client.user.id}>` ||
    message.content == `<@${message.client.user.id}>`
  ) {
    return message.channel
      .send({ content: `my prefixes for this server: \`${prefixes.join("` `")}\`` })
      .catch(() => {
        return message.member.send({
          content: `my prefixes for this server: \`${prefixes.join("` `")}\` -- i do not have permission to send messages in that channel`,
        });
      });
  }

  if (
    (await hasGuild(message.guild)) &&
    !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)
  ) {
    const res = await checkMessageContent(message.guild, message.content, true, message);

    if (!res) {
      checkAutoMute(message);
      return;
    }
  }

  for (const prefix of prefixes) {
    if (message.content.startsWith(prefix) && !(await isSlashOnly(message.guild))) {
      const args = message.content.substring(prefix.length).split(" ");

      const cmd = args[0].toLowerCase();

      runCommand(cmd, message as NypsiMessage, args);
      break;
    }
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
