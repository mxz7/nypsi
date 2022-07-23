import { ChannelType, Collection, Guild, GuildMember, Message, TextChannel } from "discord.js";
import { inPlaceSort } from "fast-sort";
import fetch from "node-fetch";
import { getGuild } from "../../nypsi";
import prisma from "../database/database";
import { addCooldown, inCooldown } from "../guilds/utils";
import { logger } from "../logger";
import { CustomEmbed } from "../models/EmbedBuilders";

const currentChannels = new Set();
const existsCache = new Set();
const enabledCache = new Map<string, number>();
const lastGame = new Map<string, number>();

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
        const guild = await getGuild(guildData.guildId);

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

export async function createReactionProfile(guild: Guild) {
    await prisma.chatReaction.create({
        data: {
            guildId: guild.id,
        },
    });
}

export async function hasReactionProfile(guild: Guild) {
    if (existsCache.has(guild.id)) {
        return true;
    }

    const query = await prisma.chatReaction.findUnique({
        where: {
            guildId: guild.id,
        },
        select: {
            guildId: true,
        },
    });

    if (query) {
        existsCache.add(guild.id);
        return true;
    } else {
        return false;
    }
}

export async function getWords(guild: Guild) {
    const query = await prisma.chatReaction.findUnique({
        where: {
            guildId: guild.id,
        },
        select: {
            wordList: true,
        },
    });

    if (query.wordList.length == 0) {
        const a = await getDefaultWords();

        return a;
    } else {
        return query.wordList;
    }
}

export async function updateWords(guild: Guild, newWordList: string[]) {
    await prisma.chatReaction.update({
        where: {
            guildId: guild.id,
        },
        data: {
            wordList: newWordList,
        },
    });
}

export async function getWordList(guild: Guild) {
    const query = await prisma.chatReaction.findUnique({
        where: {
            guildId: guild.id,
        },
        select: {
            wordList: true,
        },
    });

    return query.wordList;
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

    if (enabledCache.has(guild.id)) enabledCache.delete(guild.id);
}

export async function getReactionStats(guild: Guild, member: GuildMember) {
    const query = await prisma.chatReactionStats.findFirst({
        where: {
            AND: [{ chatReactionGuildId: guild.id }, { userId: member.user.id }],
        },
        select: {
            wins: true,
            second: true,
            third: true,
        },
    });

    return {
        wins: query.wins,
        secondPlace: query.second,
        thirdPlace: query.third,
    };
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

    const embed = new CustomEmbed().setColor("#5efb8f");

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

export async function hasReactionStatsProfile(guild: Guild, member: GuildMember) {
    const query = await prisma.chatReactionStats.findFirst({
        where: {
            AND: [{ chatReactionGuildId: guild.id }, { userId: member.user.id }],
        },
        select: {
            userId: true,
        },
    });

    if (query) {
        return true;
    } else {
        return false;
    }
}

export async function createReactionStatsProfile(guild: Guild, member: GuildMember) {
    await prisma.chatReactionStats.create({
        data: {
            chatReactionGuildId: guild.id,
            userId: member.user.id,
        },
    });
}

export async function addWin(guild: Guild, member: GuildMember) {
    await prisma.chatReactionStats.updateMany({
        where: {
            AND: [{ chatReactionGuildId: guild.id }, { userId: member.user.id }],
        },
        data: {
            wins: { increment: 1 },
        },
    });
}

export async function add2ndPlace(guild: Guild, member: GuildMember) {
    await prisma.chatReactionStats.updateMany({
        where: {
            AND: [{ chatReactionGuildId: guild.id }, { userId: member.user.id }],
        },
        data: {
            second: { increment: 1 },
        },
    });
}

export async function add3rdPlace(guild: Guild, member: GuildMember) {
    await prisma.chatReactionStats.updateMany({
        where: {
            AND: [{ chatReactionGuildId: guild.id }, { userId: member.user.id }],
        },
        data: {
            third: { increment: 1 },
        },
    });
}

export async function getServerLeaderboard(guild: Guild, amount: number): Promise<Map<string, string>> {
    let members: Collection<string, GuildMember>;

    if (inCooldown(guild) || guild.memberCount == guild.members.cache.size) {
        members = guild.members.cache;
    } else {
        members = await guild.members.fetch();

        addCooldown(guild, 3600);
    }

    if (!members) members = guild.members.cache;

    members = members.filter((m) => {
        return !m.user.bot;
    });

    const usersWins = [];
    const winsStats = new Map<string, number>();
    const usersSecond = [];
    const secondStats = new Map<string, number>();
    const usersThird = [];
    const thirdStats = new Map<string, number>();
    const overallWins = [];
    const overallStats = new Map<string, number>();

    const query = await prisma.chatReactionStats.findMany({
        where: {
            chatReactionGuildId: guild.id,
        },
        select: {
            userId: true,
            wins: true,
            second: true,
            third: true,
        },
    });

    for (const user of query) {
        let overall = false;

        if (members.find((member) => member.user.id == user.userId) && user.wins != 0) {
            usersWins.push(user.userId);
            winsStats.set(user.userId, user.wins);
            overall = true;
        }
        if (members.find((member) => member.user.id == user.userId) && user.second != 0) {
            usersSecond.push(user.userId);
            secondStats.set(user.userId, user.second);
            overall = true;
        }
        if (members.find((member) => member.user.id == user.userId) && user.third != 0) {
            usersThird.push(user.userId);
            thirdStats.set(user.userId, user.third);
            overall = true;
        }

        if (overall) {
            overallWins.push(user.userId);
            overallStats.set(user.userId, user.wins + user.second + user.third);
        }
    }

    const getMember = (id: string) => {
        const target = members.find((member) => member.user.id == id);

        return target;
    };

    inPlaceSort(usersWins).desc((i) => winsStats.get(i));
    inPlaceSort(usersSecond).desc((i) => secondStats.get(i));
    inPlaceSort(usersThird).desc((i) => thirdStats.get(i));
    inPlaceSort(overallWins).desc((i) => overallStats.get(i));

    usersWins.splice(amount, usersWins.length - amount);
    usersSecond.splice(amount, usersSecond.length - amount);
    usersThird.splice(amount, usersThird.length - amount);
    overallWins.splice(amount, overallWins.length - amount);

    let winsMsg = "";
    let secondMsg = "";
    let thirdMsg = "";
    let overallMsg = "";

    let count = 1;

    for (const user of usersWins) {
        let pos: string | number = count;

        if (count == 1) {
            pos = "🥇";
        } else if (count == 2) {
            pos = "🥈";
        } else if (count == 3) {
            pos = "🥉";
        }

        winsMsg += `${pos} **${getMember(user).user.tag}** ${winsStats.get(user).toLocaleString()}\n`;
        count++;
    }

    count = 1;

    for (const user of usersSecond) {
        let pos: string | number = count;

        if (count == 1) {
            pos = "🥇";
        } else if (count == 2) {
            pos = "🥈";
        } else if (count == 3) {
            pos = "🥉";
        }

        secondMsg += `${pos} **${getMember(user).user.tag}** ${secondStats.get(user).toLocaleString()}\n`;
        count++;
    }

    count = 1;

    for (const user of usersThird) {
        let pos: string | number = count;

        if (count == 1) {
            pos = "🥇";
        } else if (count == 2) {
            pos = "🥈";
        } else if (count == 3) {
            pos = "🥉";
        }

        thirdMsg += `${pos} **${getMember(user).user.tag}** ${thirdStats.get(user).toLocaleString()}\n`;
        count++;
    }

    count = 1;

    for (const user of overallWins) {
        let pos: string | number = count;

        if (count == 1) {
            pos = "🥇";
        } else if (count == 2) {
            pos = "🥈";
        } else if (count == 3) {
            pos = "🥉";
        }

        overallMsg += `${pos} **${getMember(user).user.tag}** ${overallStats.get(user).toLocaleString()}\n`;
        count++;
    }

    return new Map<string, string>()
        .set("wins", winsMsg)
        .set("second", secondMsg)
        .set("third", thirdMsg)
        .set("overall", overallMsg);
}

export async function getBlacklisted(guild: Guild) {
    const query = await prisma.chatReaction.findUnique({
        where: {
            guildId: guild.id,
        },
        select: {
            blacklisted: true,
        },
    });

    return query.blacklisted;
}

export async function setBlacklisted(guild: Guild, blacklisted: string[]) {
    await prisma.chatReaction.update({
        where: {
            guildId: guild.id,
        },
        data: {
            blacklisted: blacklisted,
        },
    });
}

export async function deleteStats(guild: Guild) {
    await prisma.chatReactionStats.deleteMany({
        where: {
            chatReactionGuildId: guild.id,
        },
    });
}

async function getDefaultWords(): Promise<string[]> {
    const res = await fetch(
        "https://gist.githubusercontent.com/tekoh/f8b8d6db6259cad221a679f5015d9f82/raw/e0d80c53eecd33ea4eed4a5f253da1145fa7951c/chat-reactions.txt"
    );
    const body = await res.text();

    const words = body.split("\n");

    return words;
}

export function getZeroWidth() {
    return "​";
}
