import { Guild, GuildMember, Message, Role, ThreadChannel } from "discord.js";
import * as stringSimilarity from "string-similarity";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { MStoTime } from "../date";
import { getExactMember } from "../member";
import { getAllGroupAccountIds } from "../moderation/alts";
import { newCase } from "../moderation/cases";
import { addModLog } from "../moderation/logs";
import {
  addMuteViolation,
  deleteMute,
  getAutoMuteLevels,
  getMuteRole,
  getMuteViolations,
  isMuted,
  newMute,
} from "../moderation/mute";
import { isAltPunish } from "./altpunish";
import ms = require("ms");

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

export async function getChatFilter(guild: Guild): Promise<
  {
    content: string;
    percentMatch: number;
    guildId: string;
  }[]
> {
  const cache = await redis.get(`${Constants.redis.cache.guild.CHATFILTER}:${guild.id}`);

  if (cache) return JSON.parse(cache);

  const query = await prisma.chatFilter.findMany({
    where: {
      guildId: guild.id,
    },
  });

  await redis.set(
    `${Constants.redis.cache.guild.CHATFILTER}:${guild.id}`,
    JSON.stringify(query),
    "EX",
    3600,
  );

  return query;
}

export async function deleteChatFilterWord(guildId: string, content: string) {
  await prisma.chatFilter.delete({
    where: {
      guildId_content: {
        guildId,
        content: content.toLowerCase().normalize("NFD"),
      },
    },
  });

  await redis.del(`${Constants.redis.cache.guild.CHATFILTER}:${guildId}`);
}

export async function addChatFilterWord(guildId: string, content: string, percentMatch?: number) {
  await prisma.chatFilter.create({
    data: {
      guildId,
      content: content.toLowerCase().normalize("NFD"),
      percentMatch,
    },
  });

  await redis.del(`${Constants.redis.cache.guild.CHATFILTER}:${guildId}`);
}

export async function checkMessageContent(
  guild: Guild,
  content: string,
  modlog: true,
  message: Message,
): Promise<boolean>;

export async function checkMessageContent(
  guild: Guild,
  content: string,
  modlog: false,
  message?: undefined,
): Promise<boolean>;

// Implementation
export async function checkMessageContent(
  guild: Guild,
  content: string,
  modlog: boolean,
  message?: Message,
): Promise<boolean> {
  {
    const filter = await getChatFilter(guild);

    content = content.toLowerCase().normalize("NFD");

    if (content.length >= 69) {
      for (const word of filter) {
        if (word.content.includes(" ")) {
          if (content.includes(word.content)) {
            const contentModified = content.replace(word.content, `**${word}**`);
            if (modlog) {
              addModLog(
                guild,
                "filter violation",
                message.author.id,
                guild.client.user,
                contentModified,
                -1,
                message.channelId,
              );
              await message.delete().catch(() => {});
            }
            return false;
          }
        } else {
          if (content.split(" ").indexOf(word.content) != -1) {
            const contentModified = content.replace(word.content, `**${word}**`);
            if (modlog) {
              addModLog(
                guild,
                "filter violation",
                message.author.id,
                guild.client.user,
                contentModified,
                -1,
                message.channelId,
              );
              await message.delete().catch(() => {});
            }
            return false;
          }
        }
      }
    } else {
      for (const word of filter) {
        if (word.content.includes(" ")) {
          if (content.includes(word.content)) {
            const contentModified = content.replace(word.content, `**${word}**`);
            if (modlog) {
              addModLog(
                guild,
                "filter violation",
                message.author.id,
                guild.client.user,
                contentModified,
                -1,
                message.channelId,
              );
              await message.delete().catch(() => {});
            }
            return false;
          }
        } else {
          for (const contentWord of content.split(" ")) {
            const similarity = stringSimilarity.compareTwoStrings(word.content, contentWord);

            if (similarity >= (word.percentMatch || 100) / 100) {
              const contentModified = content.replace(contentWord, `**${contentWord}**`);

              if (modlog) {
                addModLog(
                  message.guild,
                  "filter violation",
                  message.author.id,
                  message.client.user,
                  contentModified,
                  -1,
                  message.channel.id,
                  (similarity * 100).toFixed(2),
                );
                await message.delete().catch(() => {});
              }
              return false;
            }
          }
        }
      }
    }
    return true;
  }
}

export async function checkAutoMute(message: Message) {
  const muteLevels = await getAutoMuteLevels(message.guild);
  if (muteLevels.length == 0) return;

  await addMuteViolation(message.guild, message.member);
  const vl = (await getMuteViolations(message.guild, message.member)) - 1;

  const muteUser = async (member: GuildMember, length: number, isAlt?: boolean) => {
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
      muteRole = await message.guild.roles.cache.get(guildMuteRole);

      if (!muteRole) {
        logger.warn(`failed to find muterole ${message.guild.id} ${guildMuteRole}`);
        return;
      }
    }

    if (await isMuted(message.guild, member)) {
      await deleteMute(message.guild, member);
    }

    await newCase(
      message.guild,
      "mute",
      member.user.id,
      message.guild.members.me.user,
      `[${MStoTime(length * 1000, true).trim()}] filter violation${isAlt ? " (alt)" : ""}`,
    );
    if (mode !== "timeout") {
      newMute(message.guild, [member.user.id], new Date(Date.now() + length * 1000));
      logger.info(`::auto ${message.guild.id} ${member.user.id} automuted ${length}s`);
    }

    let successful = false;

    if (mode == "timeout") {
      if (length > Math.floor(ms("28 days") / 1000)) length = Math.floor(ms("28 days") / 1000);

      await member
        .disableCommunicationUntil(
          new Date(Date.now() + length * 1000),
          `filter violation auto mute - ${MStoTime(length * 1000, true).trim()}`,
        )
        .then(() => {
          successful = true;
        })
        .catch(() => {
          logger.warn(`error timing out user ${message.guild.id} ${member.user.id}`);
        });
    } else {
      await member.roles
        .add(
          muteRole,
          `filter violation auto mute${isAlt ? " (alt)" : ""} - ${MStoTime(
            length * 1000,
            true,
          ).trim()}`,
        )
        .then(() => {
          successful = true;
        })
        .catch(() => {
          logger.warn(`error adding mute role to user ${message.guild.id} ${member.user.id}`);
        });
    }

    if (successful) {
      const embed = new CustomEmbed()
        .setTitle(`muted in ${message.guild.name}`)
        .addField("length", `\`${MStoTime(length * 1000, true).trim()}\``, true)
        .setFooter({ text: "unmuted at:" })
        .setTimestamp(new Date(Date.now() + length * 1000))
        .setColor(Constants.TRANSPARENT_EMBED_COLOR)
        .addField("reason", `filter violation${isAlt ? " (alt)" : ""}`, true);

      return await member
        .send({ content: `you have been muted in ${message.guild.name}`, embeds: [embed] })
        .catch(() => {});
    }
  };

  let level: number;

  if (muteLevels[vl]) level = muteLevels[vl];
  else if (vl > 0) {
    let modified = vl;
    while (modified > 0 && !muteLevels[modified]) modified--;
    level = muteLevels[modified];
  }

  if (!level) return;

  const punishAlts = await isAltPunish(message.guild);

  await muteUser(message.member, level);

  if (punishAlts)
    for (const id of await getAllGroupAccountIds(message.guild, message.member.user.id)) {
      if (id == message.member.user.id) continue;
      const member = await getExactMember(message.guild, id);
      if (member) await muteUser(member, level, true);
    }
}
