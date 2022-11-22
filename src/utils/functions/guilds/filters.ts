import { Guild, Message, Role, ThreadChannel } from "discord.js";
import * as stringSimilarity from "string-similarity";
import prisma from "../../../init/database";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { PunishmentType } from "../../../types/Moderation";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { MStoTime } from "../date";
import { newCase } from "../moderation/cases";
import { addModLog } from "../moderation/logs";
import { deleteMute, getAutoMuteLevels, getMuteRole, getMuteViolations, isMuted, newMute } from "../moderation/mute";
import { cleanString } from "../string";
import { getPercentMatch } from "./utils";

const chatFilterCache = new Map<string, string[]>();
const snipeFilterCache = new Map<string, string[]>();

export async function getSnipeFilter(guild: Guild): Promise<string[]> {
  if (snipeFilterCache.has(guild.id)) {
    return snipeFilterCache.get(guild.id);
  }

  const query = await prisma.guild.findUnique({
    where: {
      id: guild.id,
    },
    select: {
      snipeFilter: true,
    },
  });

  const filter = query.snipeFilter;

  snipeFilterCache.set(guild.id, filter);

  setTimeout(() => {
    if (snipeFilterCache.has(guild.id)) snipeFilterCache.delete(guild.id);
  }, 43200000);

  return filter;
}

export async function updateSnipeFilter(guild: Guild, array: string[]) {
  await prisma.guild.update({
    where: {
      id: guild.id,
    },
    data: {
      snipeFilter: array,
    },
  });
  if (snipeFilterCache.has(guild.id)) snipeFilterCache.delete(guild.id);
}

export async function getChatFilter(guild: Guild): Promise<string[]> {
  if (chatFilterCache.has(guild.id)) {
    return chatFilterCache.get(guild.id);
  }

  const query = await prisma.guild.findUnique({
    where: {
      id: guild.id,
    },
    select: {
      chatFilter: true,
    },
  });

  chatFilterCache.set(guild.id, query.chatFilter);

  setTimeout(() => {
    if (chatFilterCache.has(guild.id)) chatFilterCache.delete(guild.id);
  }, 43200000);

  return query.chatFilter;
}

export async function updateChatFilter(guild: Guild, array: string[]) {
  await prisma.guild.update({
    where: {
      id: guild.id,
    },
    data: {
      chatFilter: array,
    },
  });

  if (chatFilterCache.has(guild.id)) chatFilterCache.delete(guild.id);
}

export async function checkMessageContent(message: Message) {
  const filter = await getChatFilter(message.guild);
  const match = await getPercentMatch(message.guild);

  let content: string | string[] = cleanString(message.content.toLowerCase().normalize("NFD"));

  content = content.split(" ");

  if (content.length >= 69) {
    for (const word of filter) {
      if (content.indexOf(word.toLowerCase()) != -1) {
        addModLog(
          message.guild,
          PunishmentType.FILTER_VIOLATION,
          message.author.id,
          "nypsi",
          content.join(" "),
          -1,
          message.channel.id
        );
        await message.delete().catch(() => {});
        return false;
      }
    }
  } else {
    for (const word of filter) {
      for (const contentWord of content) {
        const similarity = stringSimilarity.compareTwoStrings(word, contentWord);

        if (similarity >= match / 100) {
          const contentModified = content.join(" ").replace(contentWord, `**${contentWord}**`);

          addModLog(
            message.guild,
            PunishmentType.FILTER_VIOLATION,
            message.author.id,
            "nypsi",
            contentModified,
            -1,
            message.channel.id,
            (similarity * 100).toFixed(2)
          );
          await message.delete().catch(() => {});
          return false;
        }
      }
    }
  }
  return true;
}

export async function checkAutoMute(message: Message) {
  const vl = getMuteViolations(message.guild, message.member);

  const muteLevels = await getAutoMuteLevels(message.guild);

  const muteUser = async (length: number) => {
    const guildMuteRole = await getMuteRole(message.guild);

    let muteRole: Role;
    let mode = "role";

    if (!guildMuteRole || guildMuteRole == "default") {
      muteRole = message.guild.roles.cache.find((r) => r.name.toLowerCase() == "muted");

      if (!muteRole) {
        let channelError = false;
        try {
          const newMuteRole = await message.guild.roles
            .create({
              name: "muted",
            })
            .catch(() => {
              channelError = true;
            });

          if (newMuteRole instanceof Role) {
            muteRole = newMuteRole;
          }

          message.guild.channels.cache.forEach(async (channel) => {
            if (channel instanceof ThreadChannel) return;
            await channel.permissionOverwrites
              .edit(muteRole, {
                SendMessages: false,
                Speak: false,
                AddReactions: false,
                SendMessagesInThreads: false,
                CreatePublicThreads: false,
                CreatePrivateThreads: false,
              })
              .catch(() => {
                channelError = true;
              });
          });
        } catch (e) {
          channelError = true;
          return logger.warn(`error creating mute role ${message.guild.id}`);
        }
        if (channelError) {
          return logger.warn(`error creating mute role ${message.guild.id}`);
        }
      }
    } else if (guildMuteRole == "timeout") {
      mode = "timeout";
    } else {
      muteRole = await message.guild.roles.fetch(guildMuteRole);

      if (!muteRole) {
        logger.warn(`failed to find muterole ${message.guild.id} ${guildMuteRole}`);
        return;
      }
    }

    if (await isMuted(message.guild, message.member)) {
      await deleteMute(message.guild, message.member);
    }

    await Promise.all([
      newCase(
        message.guild,
        PunishmentType.MUTE,
        message.author.id,
        message.guild.members.me.user.tag,
        `filter violation [${MStoTime(length * 1000, true).trim()}]`
      ),
      newMute(message.guild, [message.author.id], new Date(Date.now() + length * 1000)),
    ]);

    logger.log({ message: `${message.guild.id} ${message.author.id} automuted ${length}s`, level: "auto" });

    let successful = false;

    if (mode == "timeout") {
      await message.member
        .timeout(length, `filter violation auto mute - ${MStoTime(length * 1000, true).trim()}`)
        .then(() => {
          successful = true;
        })
        .catch(() => {
          logger.warn(`error timing out user ${message.guild.id} ${message.author.id}`);
        });
    } else {
      await message.member.roles
        .add(muteRole, `filter violation auto mute - ${MStoTime(length * 1000, true).trim()}`)
        .then(() => {
          successful = true;
        })
        .catch(() => {
          logger.warn(`error adding mute role to user ${message.guild.id} ${message.author.id}`);
        });
    }

    if (successful) {
      const embed = new CustomEmbed()
        .setTitle(`muted in ${message.guild.name}`)
        .addField("length", `\`${MStoTime(length * 1000, true).trim()}\``, true)
        .setFooter({ text: "unmuted at:" })
        .setTimestamp(new Date(Date.now() + length * 1000))
        .setColor(Constants.TRANSPARENT_EMBED_COLOR)
        .addField("reason", "filter violation", true);

      return await message.member
        .send({ content: `you have been muted in ${message.guild.name}`, embeds: [embed] })
        .catch(() => {});
    }
  };

  if (muteLevels[vl]) {
    await muteUser(muteLevels[vl]);
  } else if (vl > 0) {
    let modified = vl;
    while (modified > 0 && !muteLevels[modified]) modified--;
    await muteUser(muteLevels[modified]);
  }
}
