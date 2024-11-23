import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Collection,
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
import { addTaskProgress } from "../utils/functions/economy/tasks";
import { getDisabledCommands } from "../utils/functions/guilds/disabledcommands";
import { checkAutoMute, checkMessageContent } from "../utils/functions/guilds/filters";
import { isSlashOnly } from "../utils/functions/guilds/slash";
import { getPrefix, hasGuild } from "../utils/functions/guilds/utils";
import { addMuteViolation } from "../utils/functions/moderation/mute";
import sleep from "../utils/functions/sleep";
import {
  createSupportRequest,
  getSupportRequest,
  sendToRequestChannel,
} from "../utils/functions/supportrequest";
import { createAuraTransaction } from "../utils/functions/users/aura";
import { isUserBlacklisted } from "../utils/functions/users/blacklist";
import { getLastCommand } from "../utils/functions/users/commands";
import { hasProfile } from "../utils/functions/users/utils";
import { runCommand } from "../utils/handlers/commandhandler";
import { logger } from "../utils/logger";
import { mentionQueue } from "../utils/queues/queues";
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

export default async function messageCreate(message: Message) {
  if (!message.channel.isSendable()) return;

  if (message.channel.isDMBased() && !message.author.bot) {
    logger.info("message in DM from " + message.author.username + ": " + message.content);

    if (message.system) return;

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
          "if you need support, join the [**official nypsi server**](https://discord.gg/hJTDNST) or click the button below to talk to a staff member" +
            "\n\nthis is **NOT** support for if you have been punished in an unrelated server" +
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
              .setMinLength(15),
          ),
        );

      const filter = (i: Interaction) => i.user.id == message.author.id;

      const res = await msg.awaitMessageComponent({ filter, time: 30000 }).catch(() => {});

      if (!res) {
        row.components[0].setDisabled(true);
        return await msg.edit({ components: [row] });
      }

      if (res.customId == "s") {
        await res.showModal(modal);

        const modalSubmit = await res.awaitModalSubmit({ filter, time: 300000 }).catch(() => {});

        if (!modalSubmit) return;
        if (!modalSubmit.isModalSubmit()) return;

        await modalSubmit.deferReply();

        const helpMessage = modalSubmit.fields.fields.first().value;

        const a = await getSupportRequest(message.author.id);

        if (a) return;

        const r = await createSupportRequest(
          message.author.id,
          message.client as NypsiClient,
          message.author.username,
        );

        if (!r) {
          return modalSubmit.editReply({
            embeds: [new CustomEmbed().setDescription("failed to create support request")],
          });
        } else {
          const embed = new CustomEmbed()
            .setHeader(message.author.username, message.author.avatarURL())
            .setColor(Constants.TRANSPARENT_EMBED_COLOR);

          if (message.attachments.first()) {
            if (message.attachments.first().contentType.startsWith("image/")) {
              embed.setImage(message.attachments.first().url);
            } else {
              message.content += `\n\n${message.attachments.first().url}`;
            }
          }

          embed.setDescription(helpMessage);

          await sendToRequestChannel(message.author.id, embed, message.client as NypsiClient);

          return modalSubmit.editReply({
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

          if (!(await redis.exists(`brainrot:cooldown:${message.channelId}`))) {
            const disabledCommands = await getDisabledCommands(message.guild);

            if (!disabledCommands.includes("aura"))
              message.reply({ embeds: [new CustomEmbed(message.member, `-${chosen} aura`)] });
          }
          redis.set(`brainrot:cooldown:${message.channelId}`, 1, "EX", 1);
        }
      }
    }
  };

  const checkTask = async () => {
    await sleep(500);

    const lastContents = lastContent.get(message.author.id);

    if (message.author.id === Constants.TEKOH_ID) redis.set("nypsi:tekoh:lastchat", Date.now());

    if (
      (message.channel as TextChannel).parentId === "1246516186171314337" &&
      message.content.includes(`<@${Constants.TEKOH_ID}>`) &&
      parseInt(await redis.get("nypsi:tekoh:lastchat")) < Date.now() - ms("1 hour")
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
    };

    if (!lastContents) {
      lastContent.set(message.author.id, {
        history: [message.content.toLowerCase()],
        last: Date.now(),
      });
    } else {
      let fail = false;

      if (lastContents.last > Date.now() - 15000) {
        fail = true;
      } else {
        for (const content of lastContents.history) {
          const similarity = compareTwoStrings(content, message.content.toLowerCase());

          if (similarity > 75) {
            fail = true;
            break;
          }
        }
      }

      lastContents.history.push(message.content.toLowerCase());
      lastContents.last = Date.now();
      if (lastContents.history.length >= 5) lastContents.history.shift();

      lastContent.set(message.author.id, lastContents);

      if (fail) return;
    }

    addProgress();
  };

  if (!message.author.bot) {
    if (message.guildId === Constants.NYPSI_SERVER_ID) checkTask();
    // checkAura();
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
    const res = await checkMessageContent(message);

    if (!res) {
      await addMuteViolation(message.guild, message.member);
      await checkAutoMute(message);
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
    (await getLastCommand(message.guild.ownerId)).getTime() >= Date.now() - ms("30 days")
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

      mentionQueue
        .createJob({
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
        })
        .save();
    }
  }
}
