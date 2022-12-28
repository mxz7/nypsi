import { ChannelType, Guild, Message, TextChannel } from "discord.js";
import prisma from "../../../init/database";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getZeroWidth } from "../string";
import { getBlacklisted } from "./blacklisted";
import { add2ndPlace, add3rdPlace, addWin, createReactionStatsProfile, hasReactionStatsProfile } from "./stats";
import { getWords } from "./words";
import ms = require("ms");

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

  let msg = await channel.send({ embeds: [embed] });

  const start = new Date().getTime();

  const winnersIDs: string[] = [];

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

  const winnersList: { user: string; time: string }[] = [];
  const winnersText: string[] = [];
  const medals = new Map<number, string>();

  medals.set(1, "🥇");
  medals.set(2, "🥈");
  medals.set(3, "🥉");

  let ended = false;

  const updateWinnersText = () => {
    winnersText.length = 0;

    for (const winner of winnersList) {
      if (winnersText.length >= 3) break;
      const pos = medals.get(winnersList.indexOf(winner) + 1);

      winnersText.push(`${pos} ${winner.user} in \`${winner.time}\``);
    }
  };

  const interval = setInterval(async () => {
    if (winnersList.length == winnersText.length) return;

    setTimeout(() => {
      if (ended) return;
      ended = true;

      collector.emit("end");
      clearInterval(interval);
    }, 10000);

    updateWinnersText();

    if (embed.data.fields?.length == 0) {
      embed.addField("winners", winnersText.join("\n"));
    } else {
      embed.setFields([{ name: "winners", value: winnersText.join("\n") }]);
    }

    msg = await msg.edit({ embeds: [embed] });

    if (winnersList.length == 3) {
      clearInterval(interval);
    }
  }, 750);

  collector.on("collect", async (message): Promise<void> => {
    let time: number | string = new Date().getTime();

    time = ((time - start) / 1000).toFixed(2);

    winnersList.push({ user: message.author.toString(), time: time });

    winnersIDs.push(message.author.id);

    if (!(await hasReactionStatsProfile(guild, message.member))) await createReactionStatsProfile(guild, message.member);

    switch (winnersList.length) {
      case 1:
        await addWin(guild, message.member);
        break;
      case 2:
        await add2ndPlace(guild, message.member);
        break;
      case 3:
        await add3rdPlace(guild, message.member);
        break;
    }

    return;
  });

  collector.on("end", () => {
    currentChannels.delete(channel.id);
    ended = true;
    setTimeout(async () => {
      clearInterval(interval);
      if (winnersList.length == 0) {
        embed.setDescription(embed.data.description + "\n\nnobody won ):");
      } else {
        if (winnersList.length == 1) {
          embed.setFooter({ text: "ended with 1 winner" });
        } else {
          embed.setFooter({ text: `ended with ${winnersList.length} winners` });
        }
        updateWinnersText();

        if (embed.data.fields?.length == 0) {
          embed.addField("winners", winnersText.join("\n"));
        } else {
          embed.setFields([{ name: "winners", value: winnersText.join("\n") }]);
        }
      }

      await msg.edit({ embeds: [embed] }).catch(() => {});
    }, 1000);
  });
}
