import { ChannelType, Guild, GuildMember, Message, TextChannel } from "discord.js";
import prisma from "../../../init/database";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { logger } from "../../logger";
import { getZeroWidth } from "../string";
import { getBlacklisted } from "./blacklisted";
import { add2ndPlace, add3rdPlace, addWin, createReactionStatsProfile, hasReactionStatsProfile } from "./stats";
import { getWords } from "./words";
import ms = require("ms");
import Constants from "../../Constants";

const currentChannels = new Set<string>();
const lastGame = new Map<string, number>();

export function doChatReactions(client: NypsiClient) {
  setInterval(async () => {
    let count = 0;

    for (const guildId of client.guilds.cache.keys()) {
      const guildData = await prisma.chatReaction.findFirst({
        where: {
          AND: [{ guildId: guildId }, { randomStart: true }],
        },
        select: {
          guildId: true,
          randomChannels: true,
          betweenEvents: true,
          randomModifier: true,
        },
      });

      if (!guildData) continue;

      const guild = client.guilds.cache.get(guildId);

      if (!guild) continue;

      const channels = guildData.randomChannels;

      if (channels.length == 0) continue;

      const now = new Date().getTime();

      for (const ch of channels) {
        if (lastGame.has(ch)) {
          if (now >= lastGame.get(ch)) {
            lastGame.delete(ch);
          } else {
            continue;
          }
        }

        const channel = guild.channels.cache.find((cha) => cha.id == ch);

        if (!channel) {
          continue;
        }

        if (!channel.isTextBased()) return;
        if (channel.isThread()) return;
        if (channel.type == ChannelType.GuildVoice) return;
        if (channel.type == ChannelType.GuildNews) return;

        const messages = await channel.messages.fetch({ limit: 50 }).catch(() => {});
        let stop = false;

        if (!messages) continue;

        messages.forEach((m) => {
          if (m.author.id == guild.client.user.id) {
            if (!m.embeds[0]) return;
            if (!m.embeds[0].author) return;
            if (m.embeds[0].author.name == "chat reaction") {
              stop = true;
              return;
            }
          }
        });

        if (stop) {
          continue;
        }

        const a = await startReaction(guild, channel);

        if (a != "xoxo69") {
          count++;
        } else {
          continue;
        }

        const base = guildData.betweenEvents;
        let final;

        if (guildData.randomModifier == 0) {
          final = base;
        } else {
          const o = ["+", "-"];
          let operator = o[Math.floor(Math.random() * o.length)];

          if (base - guildData.randomModifier < 120) {
            operator = "+";
          }

          const amount = Math.floor(Math.random() * guildData.randomModifier);

          if (operator == "+") {
            final = base + amount;
          } else {
            final = base - amount;
          }
        }

        const nextGame = new Date().getTime() + final * 1000;

        lastGame.set(channel.id, nextGame);

        continue;
      }
    }

    if (count > 0) {
      logger.log({
        level: "auto",
        message: `${count} chat reaction${count > 1 ? "s" : ""} started`,
      });
    }
  }, ms("15m"));
}

export async function createReactionProfile(guild: Guild) {
  await prisma.chatReaction.create({
    data: {
      guildId: guild.id,
    },
  });
}

export async function hasReactionProfile(guild: Guild) {
  const query = await prisma.chatReaction.findUnique({
    where: {
      guildId: guild.id,
    },
    select: {
      guildId: true,
    },
  });

  if (query) {
    return true;
  } else {
    return false;
  }
}

export async function getReactionSettings(guild: Guild) {
  const query = await prisma.chatReaction.findUnique({
    where: {
      guildId: guild.id,
    },
    select: {
      randomStart: true,
      randomChannels: true,
      betweenEvents: true,
      randomModifier: true,
      timeout: true,
    },
  });

  return query;
}

export async function updateReactionSettings(
  guild: Guild,
  settings: {
    randomStart: boolean;
    randomChannels: string[];
    betweenEvents: number;
    randomModifier: number;
    timeout: number;
  }
) {
  await prisma.chatReaction.update({
    where: {
      guildId: guild.id,
    },
    data: {
      randomStart: settings.randomStart,
      randomChannels: settings.randomChannels,
      randomModifier: settings.randomModifier,
      betweenEvents: settings.betweenEvents,
      timeout: settings.timeout,
    },
  });
}

export async function startReaction(guild: Guild, channel: TextChannel) {
  if (currentChannels.has(channel.id)) return "xoxo69";

  currentChannels.add(channel.id);

  const words = await getWords(guild);

  const chosenWord = words[Math.floor(Math.random() * words.length)];
  let displayWord = chosenWord;

  const zeroWidthCount = chosenWord.length / 2;

  const zeroWidthChar = getZeroWidth();

  for (let i = 0; i < zeroWidthCount; i++) {
    const pos = Math.floor(Math.random() * chosenWord.length + 1);

    displayWord = displayWord.substr(0, pos) + zeroWidthChar + displayWord.substr(pos);
  }

  const embed = new CustomEmbed().setColor(Constants.EMBED_SUCCESS_COLOR);

  embed.setHeader("chat reaction");
  embed.setDescription(`type: \`${displayWord}\``);

  const msg = await channel.send({ embeds: [embed] });

  const start = new Date().getTime();

  const winners = new Map<number, { mention: string; time: string; member: GuildMember }>();
  const winnersIDs: string[] = [];

  let waiting = false;
  const blacklisted = await getBlacklisted(guild);

  const filter = async (m: Message) =>
    m.content.toLowerCase() == chosenWord.toLowerCase() &&
    winnersIDs.indexOf(m.author.id) == -1 &&
    !m.member.user.bot &&
    blacklisted.indexOf(m.author.id) == -1;

  const timeout = (await getReactionSettings(guild)).timeout;

  const collector = channel.createMessageCollector({
    filter,
    max: 3,
    time: timeout * 1000,
  });

  collector.on("collect", async (message): Promise<void> => {
    let time: number | string = new Date().getTime();

    time = ((time - start) / 1000).toFixed(2);

    if (!(await hasReactionStatsProfile(guild, message.member))) await createReactionStatsProfile(guild, message.member);

    if (winners.size == 0) {
      embed.addField("winners", `🥇 ${message.author.toString()} in \`${time}s\``);

      await addWin(guild, message.member);

      setTimeout(() => {
        if (winners.size != 3) {
          return collector.stop();
        }
      }, 10000);
    } else {
      if (winners.size == 1) {
        waiting = true;

        setTimeout(async () => {
          waiting = false;

          if (winners.size == 1) {
            return;
          } else {
            const field = embed.data.fields.find((f) => f.name == "winners");

            field.value += `\n🥈 ${winners.get(2).mention} in \`${winners.get(2).time}s\``;

            await add2ndPlace(guild, winners.get(2).member);

            if (winners.get(3)) {
              field.value += `\n🥉 ${winners.get(3).mention} in \`${winners.get(3).time}s\``;
              await add3rdPlace(guild, winners.get(3).member);
            }

            return await msg.edit({ embeds: [embed] }).catch(() => {
              currentChannels.delete(channel.id);
              collector.stop();
              return;
            });
          }
        }, 250);
      } else {
        if (!waiting) {
          const field = embed.data.fields.find((f) => f.name == "winners");

          field.value += `\n🥉 ${message.author.toString()} in \`${time}s\``;

          await add3rdPlace(guild, message.member);
        }
      }
    }

    winners.set(winners.size + 1, {
      mention: message.author.toString(),
      time: time,
      member: message.member,
    });
    winnersIDs.push(message.author.id);
    if (!waiting) {
      await msg.edit({ embeds: [embed] }).catch(() => {
        currentChannels.delete(channel.id);
        collector.stop();
        return;
      });
      return;
    }
  });

  collector.on("end", () => {
    currentChannels.delete(channel.id);
    setTimeout(async () => {
      if (winners.size == 0) {
        embed.setDescription(embed.data.description + "\n\nnobody won ):");
      } else if (winners.size == 1) {
        embed.setFooter({ text: "ended with 1 winner" });
      } else {
        embed.setFooter({ text: `ended with ${winners.size} winners` });
      }
      await msg.edit({ embeds: [embed] }).catch(() => {});
    }, 500);
  });
}
