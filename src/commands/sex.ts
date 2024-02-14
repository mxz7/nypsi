import dayjs = require("dayjs");
import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import redis from "../init/redis.js";
import { NypsiClient } from "../models/Client.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";

import Constants from "../utils/Constants.js";
import { MStoTime } from "../utils/functions/date.js";
import { addProgress } from "../utils/functions/economy/achievements.js";
import { addTaskProgress } from "../utils/functions/economy/tasks.js";
import { getTagsData } from "../utils/functions/economy/utils.js";
import { cleanString } from "../utils/functions/string.js";
import { addNotificationToQueue, getDmSettings } from "../utils/functions/users/notifications.js";
import { getLastKnownUsername } from "../utils/functions/users/tag.js";
import { getActiveTag } from "../utils/functions/users/tags.js";
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
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data).catch(async () => {
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

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
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
          milf.guildId == "747056029795221513"
            ? "[nypsi](https://discord.gg/hJTDNST)"
            : milf.guildName
        }**\n\n` +
          `go ahead and send [**${
            tag ? `[${getTagsData()[tag.tagId].emoji}]` : ""
          }${await getLastKnownUsername(milf.userId)}**](https://nypsi.xyz/user/${
            milf.userId
          }) a *private* message 😉😏`,
      ).setHeader("milf finder");

      if (milf.description != "") {
        embed.setDescription(
          `a match has been made from **${
            milf.guildId == "747056029795221513"
              ? "[nypsi](https://discord.gg/hJTDNST)"
              : milf.guildName
          }**\n\n` +
            `[**${tag ? `[${getTagsData()[tag.tagId].emoji}]` : ""}${await getLastKnownUsername(
              milf.userId,
            )}**](https://nypsi.xyz/user/${milf.userId}) - ${milf.description}\n\n` +
            "go ahead and send them a *private* message 😉😏",
        );
      }

      await Promise.all([
        send({ embeds: [embed] }),
        addProgress(message.author.id, "whore", 1),
        addProgress(milf.userId, "whore", 1),
        addTaskProgress(message.author.id, "horny"),
        addTaskProgress(milf.userId, "horny"),
      ]);

      const authorTag = await getActiveTag(message.author.id);

      const embed2 = new CustomEmbed(
        undefined,
        `a match has been made from **${
          message.guild.id == "747056029795221513"
            ? "[nypsi](https://discord.gg/hJTDNST)"
            : message.guild.name
        }**\n\ngo ahead and send [${
          authorTag ? `[${getTagsData()[authorTag.tagId].emoji}]` : ""
        }**${message.author.username}**](https://nypsi.xyz/user/${
          message.author.id
        }) a *private* message 😉😏`,
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

      if (description !== "") {
        embed2.setDescription(
          `a match has been made from **${
            message.guild.id == "747056029795221513"
              ? "[nypsi](https://discord.gg/hJTDNST)"
              : message.guild.name
          }**\n\n` +
            `[${authorTag ? `[${getTagsData()[authorTag.tagId].emoji}]` : ""}**${
              message.author.username
            }**](https://nypsi.xyz/user/${message.author.id}) - ${description}\n\n` +
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
        await addNotificationToQueue({
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
