import { ChannelType, Client } from "discord.js";
import { startReaction } from "../../chatreactions/utils";
import prisma from "../../database/database";
import { logger } from "../../logger";

const lastGame = new Map<string, number>();

export function doChatReactions(client: Client) {
    setInterval(async () => {
        let count = 0;

        const query = await prisma.chatReaction.findMany({
            where: {
                randomStart: true,
            },
            select: {
                guildId: true,
                randomChannels: true,
                betweenEvents: true,
                randomModifier: true,
            },
        });

        for (const guildData of query) {
            const guild = await client.guilds.fetch(guildData.guildId);

            if (!guild) {
                continue;
            }

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
    }, 60000);
}
