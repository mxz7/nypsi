import dayjs = require("dayjs");
import { CommandInteraction, MessageFlags } from "discord.js";
import redis from "../init/redis.js";
import { NypsiClient } from "../models/Client.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants.js";
import { MStoTime } from "../utils/functions/date.js";
import { addProgress } from "../utils/functions/economy/achievements.js";
import { addEventProgress, EventData, getCurrentEvent } from "../utils/functions/economy/events.js";
import { addTaskProgress } from "../utils/functions/economy/tasks.js";
import { getTagsData } from "../utils/functions/economy/utils.js";
import { checkMessageContent } from "../utils/functions/guilds/filters.js";
import { isMuted } from "../utils/functions/moderation/mute.js";
import { cleanString } from "../utils/functions/string.js";
import { addNotificationToQueue, getDmSettings } from "../utils/functions/users/notifications.js";
import { getActiveTag } from "../utils/functions/users/tags.js";
import { getLastKnownUsername } from "../utils/functions/users/username.js";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";

const cmd = new Command("sex", "find horny milfs in ur area 😏", "fun").setAliases([
  "findhornymilfsinmyarea",
  "milffinder",
  "findamilf",
  "letsfuck",
  "milf",
]);

interface MilfSearchData {
  userId: string;
  guildId: string;
  guildName: string;
  channelId: string;
  description: string;
  date: number;
}

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option.setName("message").setDescription("a good pickup line always works (;"),
);

const descFilter = [
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "nig",
  "ugly",
  "discordgg",
  "discordcom",
  "discordappcom",
  "gay",
  "tranny",
  "cracker",
  "chink",
  "pornhub",
  "porn",
  "xvideos",
  "xhamster",
  "redtube",
  "grabify",
  "bitly",
];

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  for (const item of descFilter) {
    if (message.guild.name.toLowerCase().includes(item)) {
      return send({ embeds: [new ErrorEmbed("this server is not able to use this command")] });
    }
  }

  if ((await redis.exists(`${Constants.redis.cooldown.SEX_CHASTITY}:${message.author.id}`)) == 1) {
    const init = parseInt(
      await redis.get(`${Constants.redis.cooldown.SEX_CHASTITY}:${message.author.id}`),
    );
    const remaining = MStoTime(Date.now() + 10800000 - init);

    return send({
      embeds: [
        new ErrorEmbed(
          `you have been equipped with a *chastity cage*, it will be removed in **${remaining}**`,
        ),
      ],
    });
  }

  await addCooldown(cmd.name, message.member, 45);

  const addToLooking = async (description: string) => {
    const obj: MilfSearchData = {
      userId: message.author.id,
      guildId: message.guild.id,
      guildName: message.guild.name,
      channelId: message.channel.id,
      description: description,
      date: new Date().getTime(),
    };

    await redis.rpush(Constants.redis.nypsi.MILF_QUEUE, JSON.stringify(obj));
  };

  let description = "";

  if (args.length > 0) {
    description = args.join(" ");
    const descriptionCheck = cleanString(description);

    for (const word of descFilter) {
      if (descriptionCheck.includes(word)) {
        description = "";
        break;
      }
    }
    if (description.length > 50) {
      description = description.substring(0, 50) + "...";
    }
  }

  if ((await redis.llen(Constants.redis.nypsi.MILF_QUEUE)) < 1) {
    await addToLooking(description);
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          "you're now on the milf waiting list 😏\n\nyou'll be notified when a match is found",
        ).setHeader("milf finder"),
      ],
    });
  } else {
    if (
      (await redis.lrange(Constants.redis.nypsi.MILF_QUEUE, 0, -1)).find(
        (i) => (JSON.parse(i) as MilfSearchData).userId === message.author.id,
      )
    ) {
      return send({
        embeds: [new ErrorEmbed("we're already searching for a match.. calm down you horny shit")],
      });
    }

    for (const milf of (await redis.lrange(Constants.redis.nypsi.MILF_QUEUE, 0, -1)).map(
      (i) => JSON.parse(i) as MilfSearchData,
    )) {
      if (message.guild.id == milf.guildId) continue;

      await redis.lrem(Constants.redis.nypsi.MILF_QUEUE, 1, JSON.stringify(milf));

      const tag = await getActiveTag(milf.userId);

      const embed = new CustomEmbed(
        message.member,
        `a match has been made from **${
          milf.guildId == Constants.NYPSI_SERVER_ID
            ? `[nypsi](${Constants.NYPSI_SERVER_INVITE_LINK})`
            : milf.guildName
        }**\n\n` +
          `go ahead and send [**${
            tag ? `[${getTagsData()[tag.tagId].emoji}] ` : ""
          }${await getLastKnownUsername(milf.userId, false)}**](https://nypsi.xyz/users/${
            milf.userId
          }?ref=bot-milf) a *private* message 😉😏`,
      ).setHeader("milf finder");

      if (
        milf.description != "" &&
        (await checkMessageContent(message.guild, milf.description, false)) &&
        !(await isMuted(message.guild, milf.userId))
      ) {
        embed.setDescription(
          `a match has been made from **${
            milf.guildId == Constants.NYPSI_SERVER_ID
              ? `[nypsi](${Constants.NYPSI_SERVER_INVITE_LINK})`
              : milf.guildName
          }**\n\n` +
            `[**${tag ? `[${getTagsData()[tag.tagId].emoji}] ` : ""}${await getLastKnownUsername(
              milf.userId,
              false,
            )}**](https://nypsi.xyz/users/${milf.userId}?ref=bot-milf) - ${milf.description}\n\n` +
            "go ahead and send them a *private* message 😉😏",
        );
      }

      const promises = await Promise.all([
        send({ embeds: [embed] }),
        addProgress(message.member, "whore", 1),
        addProgress(milf.userId, "whore", 1),
        addTaskProgress(message.member, "horny"),
        addTaskProgress(milf.userId, "horny"),
        addEventProgress(message.client as NypsiClient, message.member, "milfs", 1),
        addEventProgress(message.client as NypsiClient, milf.userId, "milfs", 1),
      ]);

      const eventProgress = promises.slice(-2, -1).toSorted()[1] as number;

      const authorTag = await getActiveTag(message.member);

      const eventData: { event?: EventData; target: number } = { target: 0 };

      if (eventProgress) {
        eventData.event = await getCurrentEvent();

        if (eventData.event) {
          eventData.target = Number(eventData.event.target);
        }
      }

      const embed2 = new CustomEmbed(
        undefined,
        `a match has been made from **${
          message.guild.id == Constants.NYPSI_SERVER_ID
            ? `[nypsi](${Constants.NYPSI_SERVER_INVITE_LINK})`
            : message.guild.name
        }**\n\ngo ahead and send [${
          authorTag ? `[${getTagsData()[authorTag.tagId].emoji}] ` : ""
        }**${message.author.username}**](https://nypsi.xyz/users/${
          message.author.id
        }?ref=bot-milf) a *private* message 😉😏` +
          (eventProgress
            ? `\n\n🔱 ${eventProgress.toLocaleString()}/${eventData.target.toLocaleString()}`
            : ""),
      )
        .setHeader("milf finder")
        .setColor(Constants.EMBED_SUCCESS_COLOR);

      let description = "";

      if (args.length > 0) {
        description = args.join(" ");
        const descriptionCheck = cleanString(description);

        for (const word of descFilter) {
          if (descriptionCheck.includes(word)) {
            description = "";
            break;
          }
        }
        if (description.length > 50) {
          description = description.substring(0, 50) + "...";
        }
      }

      if (
        description != "" &&
        (await checkMessageContent(milf.guildId, description, false)) &&
        !(await isMuted(milf.guildId, message.author.id))
      ) {
        embed2.setDescription(
          `a match has been made from **${
            message.guild.id == Constants.NYPSI_SERVER_ID
              ? `[nypsi](${Constants.NYPSI_SERVER_INVITE_LINK})`
              : message.guild.name
          }**\n\n` +
            `[${authorTag ? `[${getTagsData()[authorTag.tagId].emoji}] ` : ""}**${
              message.author.username
            }**](https://nypsi.xyz/users/${message.author.id}?ref=bot-milf) - ${description}\n\n` +
            "go ahead and send them a *private* message 😉😏",
        );
      }

      const clusters = await (message.client as NypsiClient).cluster.broadcastEval(
        async (client, { guildId }) => {
          const guild = client.guilds.cache.get(guildId);

          if (guild) return (client as unknown as NypsiClient).cluster.id;
          return "not-found";
        },
        { context: { guildId: milf.guildId } },
      );

      let cluster: number;

      for (const i of clusters) {
        if (i != "not-found") {
          cluster = i;
          break;
        }
      }

      return await (message.client as NypsiClient).cluster.broadcastEval(
        async (client, { embed, cluster, userId, channelId, guildId }) => {
          if ((client as unknown as NypsiClient).cluster.id != cluster) return;
          const guild = client.guilds.cache.get(guildId);

          if (!guild) return;

          const channel = guild.channels.cache.get(channelId);

          if (!channel) return;

          if (channel.isTextBased()) {
            const member = await guild.members.fetch(userId);
            if (!member) return;

            await channel.send({ content: member.toString(), embeds: [embed] });

            return;
          }
        },
        {
          context: {
            embed: embed2.toJSON(),
            cluster: cluster,
            userId: milf.userId,
            channelId: milf.channelId,
            guildId: milf.guildId,
          },
        },
      );
    }

    addToLooking(description);
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          "you're now on the milf waiting list 😏\n\nyou'll be notified when a match is found",
        ).setHeader("milf finder"),
      ],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;

setInterval(async () => {
  const milfs = await redis.lrange(Constants.redis.nypsi.MILF_QUEUE, 0, -1);

  milfs.forEach(async (obj) => {
    const milf = JSON.parse(obj) as MilfSearchData;
    if (dayjs(milf.date).isBefore(dayjs().subtract(6, "hours"))) {
      await redis.lrem(Constants.redis.nypsi.MILF_QUEUE, 1, obj);
      if ((await getDmSettings(milf.userId)).other) {
        addNotificationToQueue({
          memberId: milf.userId,
          payload: {
            embed: new CustomEmbed(undefined, "unfortunately we couldn't find you a milf 😢")
              .setColor(Constants.EMBED_FAIL_COLOR)
              .setHeader("milf finder"),
          },
        });
      }
    }
  });
}, 600000);
