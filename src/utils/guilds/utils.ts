import { BaseGuildTextChannel, Client, Collection, Guild, GuildMember } from "discord.js";
import ms = require("ms");
import { checkGuild, eSnipe, getGuild, snipe } from "../../nypsi";
import prisma from "../database/database";
import redis from "../database/redis";
import { daysUntil, daysUntilChristmas, MStoTime } from "../functions/date";
import { logger } from "../logger";
import { CustomEmbed } from "../models/EmbedBuilders";

setInterval(() => {
    const now = new Date().getTime();

    let snipeCount = 0;
    let eSnipeCount = 0;

    snipe.forEach((msg) => {
        const diff = now - msg.createdTimestamp;

        if (diff >= 43200000) {
            snipe.delete(msg.channel.id);
            snipeCount++;
        }
    });

    if (snipeCount > 0) {
        logger.log({
            level: "auto",
            message: "deleted " + snipeCount.toLocaleString() + " sniped messages",
        });
    }

    eSnipe.forEach((msg) => {
        const diff = now - msg.createdTimestamp;

        if (diff >= 43200000) {
            eSnipe.delete(msg.channel.id);
            eSnipeCount++;
        }
    });

    if (eSnipeCount > 0) {
        logger.log({
            level: "auto",
            message: "deleted " + eSnipeCount.toLocaleString() + " edit sniped messages",
        });
    }
}, 3600000);

setInterval(async () => {
    const query = await prisma.guild.findMany({
        select: {
            id: true,
        },
    });

    for (const guild of query) {
        const exists = checkGuild(guild.id);

        if (!exists) {
            await prisma.guildCounter.deleteMany({
                where: {
                    guildId: guild.id,
                },
            });
            await prisma.guildChristmas.deleteMany({
                where: {
                    guildId: guild.id,
                },
            });
            await prisma.guildCountdown.deleteMany({
                where: {
                    guildId: guild.id,
                },
            });
            await prisma.chatReactionStats.deleteMany({
                where: {
                    chatReactionGuildId: guild.id,
                },
            });
            await prisma.chatReaction.deleteMany({
                where: {
                    guildId: guild.id,
                },
            });
            await prisma.moderationMute.deleteMany({
                where: {
                    guildId: guild.id,
                },
            });
            await prisma.moderationBan.deleteMany({
                where: {
                    guildId: guild.id,
                },
            });
            await prisma.moderationCase.deleteMany({
                where: {
                    guildId: guild.id,
                },
            });
            await prisma.moderation.deleteMany({
                where: {
                    guildId: guild.id,
                },
            });
            await prisma.guild.deleteMany({
                where: {
                    id: guild.id,
                },
            });

            logger.log({
                level: "guild",
                message: `deleted guild '${guild.id}' from guild data`,
            });
        }
    }
    existsCooldown.clear();
}, ms("2 days"));

const fetchCooldown = new Set();
const existsCooldown = new Set();
const disableCache = new Map();
const chatFilterCache = new Map();
const snipeFilterCache = new Map();

export async function runCheck(guild: Guild) {
    if (!(await hasGuild(guild))) await createGuild(guild);

    const query = await prisma.guild.findUnique({
        where: {
            id: guild.id,
        },
        select: {
            peak: true,
        },
    });

    if (!query) {
        return;
    }

    const currentMembersPeak = query.peak;

    if (guild.memberCount > currentMembersPeak) {
        await prisma.guild.update({
            where: {
                id: guild.id,
            },
            data: {
                peak: guild.memberCount,
            },
        });
    }
}

export async function hasGuild(guild: Guild): Promise<boolean> {
    if (existsCooldown.has(guild.id)) return true;
    const query = await prisma.guild.findUnique({
        where: {
            id: guild.id,
        },
        select: {
            id: true,
        },
    });

    if (query) {
        existsCooldown.add(guild.id);

        setTimeout(() => {
            if (!existsCooldown.has(guild.id)) return;
            existsCooldown.delete(guild.id);
        }, 43200000);
        return true;
    } else {
        return false;
    }
}

export async function getPeaks(guild: Guild) {
    const query = await prisma.guild.findUnique({
        where: {
            id: guild.id,
        },
        select: {
            peak: true,
        },
    });

    return query.peak;
}

export async function createGuild(guild: Guild) {
    await prisma.guild.create({
        data: {
            id: guild.id,
        },
    });

    existsCooldown.add(guild);

    setTimeout(() => {
        if (!existsCooldown.has(guild.id)) return;
        existsCooldown.delete(guild.id);
    }, 43200000);
}

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

export async function getGuildCounter(guild: Guild) {
    const query = await prisma.guildCounter.findUnique({
        where: {
            guildId: guild.id,
        },
    });

    return query;
}

export async function createGuildCounter(guild: Guild) {
    await prisma.guildCounter.create({
        data: {
            guildId: guild.id,
        },
    });
}

export async function setGuildCounter(guild: Guild, profile: any) {
    await prisma.guildCounter.update({
        where: {
            guildId: guild.id,
        },
        data: {
            enabled: profile.enabled,
            format: profile.format,
            filterBots: profile.filterBots,
            channel: profile.channel,
        },
    });
}

export function checkStats() {
    setInterval(async () => {
        const query = await prisma.guildCounter.findMany({
            where: {
                enabled: true,
            },
        });

        for (const profile of query) {
            const guild = await getGuild(profile.guildId);

            if (!guild) continue;

            let memberCount: number;

            if (profile.filterBots && guild.memberCount >= 500) {
                profile.filterBots = false;
                await setGuildCounter(guild, profile);
                memberCount = guild.memberCount;
            } else if (profile.filterBots) {
                let members: Collection<string, GuildMember> | void;

                if (inCooldown(guild) || guild.memberCount == guild.members.cache.size) {
                    members = guild.members.cache;
                } else {
                    members = await guild.members.fetch().catch(() => {});
                    addCooldown(guild, 3600);
                }

                if (!members) return;

                if (members.size == guild.memberCount) {
                    members = members.filter((m) => !m.user.bot);

                    memberCount = members.size;
                } else {
                    memberCount = guild.memberCount;
                }
            } else {
                memberCount = guild.memberCount;
            }

            if (!memberCount) memberCount = guild.memberCount;

            const channel = guild.channels.cache.find((c) => c.id == profile.channel);

            if (!channel) {
                continue;
            }

            let format = profile.format;
            format = format.split("%count%").join(memberCount.toLocaleString());
            format = format.split("%peak%").join((await getPeaks(guild)).toLocaleString());

            if (channel.name != format) {
                const old = channel.name;

                await channel
                    .edit({ name: format })
                    .then(() => {
                        logger.log({
                            level: "auto",
                            message: "counter updated for '" + guild.name + "' ~ '" + old + "' -> '" + format + "'",
                        });
                    })
                    .catch(async () => {
                        logger.warn("error updating counter in " + guild.name);
                        profile.enabled = false;
                        profile.channel = "none";
                        await setGuildCounter(guild, profile);
                    });
            }
        }
    }, 600000);
}

export function addCooldown(guild: Guild, seconds: number) {
    fetchCooldown.add(guild.id);

    setTimeout(() => {
        fetchCooldown.delete(guild.id);
    }, seconds * 1000);
}

export function inCooldown(guild: Guild): boolean {
    if (fetchCooldown.has(guild.id)) {
        return true;
    } else {
        return false;
    }
}

export async function getPrefix(guild: Guild): Promise<string> {
    try {
        if (await redis.exists(`cache:guild:prefix:${guild.id}`)) {
            return redis.get(`cache:guild:prefix:${guild.id}`);
        }

        const query = await prisma.guild.findUnique({
            where: {
                id: guild.id,
            },
            select: {
                prefix: true,
            },
        });

        if (query.prefix == "") {
            query.prefix = "$";
            await prisma.guild.update({
                where: {
                    id: guild.id,
                },
                data: {
                    prefix: "$",
                },
            });
        }

        await redis.set(`cache:guild:prefix:${guild.id}`, query.prefix);
        await redis.expire(`cache:guild:prefix:${guild.id}`, 3600);

        return query.prefix;
    } catch (e) {
        if (!(await hasGuild(guild))) await createGuild(guild);
        logger.warn("couldn't fetch prefix for server " + guild.id);
        return "$";
    }
}

export async function setPrefix(guild: Guild, prefix: string) {
    await prisma.guild.update({
        where: {
            id: guild.id,
        },
        data: {
            prefix: prefix,
        },
    });

    await redis.del(`cache:guild:prefix:${guild.id}`);
}

export async function hasChristmasCountdown(guild: Guild) {
    const query = await prisma.guildChristmas.findUnique({
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

export async function createNewChristmasCountdown(guild: Guild) {
    await prisma.guildChristmas.create({
        data: {
            guildId: guild.id,
        },
    });
}

export async function getChristmasCountdown(guild: Guild) {
    const query = await prisma.guildChristmas.findUnique({
        where: {
            guildId: guild.id,
        },
    });

    return query;
}

export async function setChristmasCountdown(guild: Guild, xmas: any) {
    await prisma.guildChristmas.update({
        where: {
            guildId: guild.id,
        },
        data: {
            enabled: xmas.enabled,
            format: xmas.format,
            channel: xmas.channel,
        },
    });
}

export async function checkChristmasCountdown(guild: Guild) {
    const profile = await getChristmasCountdown(guild);

    const channel = guild.channels.cache.find((c) => c.id == profile.channel);

    if (!channel) {
        profile.enabled = false;
        profile.channel = "none";
        await setChristmasCountdown(guild, profile);
        return;
    }

    let format = profile.format;

    const days = daysUntilChristmas();

    format = format.split("%days%").join(daysUntilChristmas().toString());

    if (days == "ITS CHRISTMAS") {
        format = "MERRY CHRISTMAS EVERYONE I HOPE YOU HAVE A FANTASTIC DAY WOO";
    }

    if (!channel.isTextBased()) return;

    return await channel
        .send({
            embeds: [new CustomEmbed().setDescription(format).setColor("#ff0000").setTitle(":santa_tone1:")],
        })
        .then(() => {
            logger.log({
                level: "auto",
                message: `sent christmas countdown in ${guild.name} ~ ${format}`,
            });
        })
        .catch(async () => {
            logger.error(`error sending christmas countdown in ${guild.name}`);
            profile.enabled = false;
            profile.channel = "none";
            await setChristmasCountdown(guild, profile);
            return;
        });
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

export async function getDisabledCommands(guild: Guild): Promise<string[]> {
    if (disableCache.has(guild.id)) {
        return disableCache.get(guild.id);
    }

    const query = await prisma.guild.findUnique({
        where: {
            id: guild.id,
        },
        select: {
            disabledCommands: true,
        },
    });

    disableCache.set(guild.id, query.disabledCommands);

    setTimeout(() => {
        if (disableCache.has(guild.id)) disableCache.delete(guild.id);
    }, 43200000);

    return query.disabledCommands;
}

export async function updateDisabledCommands(guild: Guild, array: string[]) {
    await prisma.guild.update({
        where: {
            id: guild.id,
        },
        data: {
            disabledCommands: array,
        },
    });

    if (disableCache.has(guild.id)) disableCache.delete(guild.id);
}

export async function getCountdowns(guild: Guild | string) {
    let guildID;

    if (guild instanceof Guild) {
        guildID = guild.id;
    } else {
        guildID = guild;
    }

    const query = await prisma.guildCountdown.findMany({
        where: {
            guildId: guildID,
        },
    });

    return query;
}

export async function getCountdown(guild: Guild | string, id: string) {
    let guildID;

    if (guild instanceof Guild) {
        guildID = guild.id;
    } else {
        guildID = guild;
    }

    const query = await prisma.guildCountdown.findFirst({
        where: {
            AND: [{ guildId: guildID }, { id: id }],
        },
    });

    return query;
}

export async function addCountdown(guild: Guild, date: Date | number, format: string, finalFormat: string, channel: string) {
    const countdowns = await getCountdowns(guild);

    const id = countdowns.length + 1;

    if (typeof date == "number") {
        date = new Date(date);
    }

    await prisma.guildCountdown.create({
        data: {
            date: date,
            format: format,
            finalFormat: finalFormat,
            channel: channel,
            id: id.toString(),
            guildId: guild.id,
        },
    });
}

export async function deleteCountdown(guild: Guild | string, id: string | number) {
    let guildID: string;

    if (guild instanceof Guild) {
        guildID = guild.id;
    } else {
        guildID = guild;
    }

    id = id.toString();

    await prisma.guildCountdown.deleteMany({
        where: {
            AND: [{ guildId: guildID }, { id: id }],
        },
    });
}

export function runCountdowns(client: Client) {
    const now = new Date();

    let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`;

    if (now.getHours() < 3) {
        d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`;
    }

    const needed = new Date(Date.parse(d) + 10800000);

    const runCountdowns = async () => {
        const query = await prisma.guildCountdown.findMany();

        for (const countdown of query) {
            const guildID = countdown.guildId;

            const days = daysUntil(new Date(countdown.date)) + 1;

            let message;

            if (days == 0) {
                message = countdown.finalFormat;
            } else {
                message = countdown.format.split("%days%").join(days.toLocaleString());
            }

            const embed = new CustomEmbed();

            embed.setDescription(message);
            embed.setColor("#111111");

            const guildToSend = await client.guilds.fetch(guildID).catch(() => {});

            if (!guildToSend) continue;

            const channel = guildToSend.channels.cache.find((ch) => ch.id == countdown.channel);

            if (!channel) continue;

            if (!(channel instanceof BaseGuildTextChannel)) continue;

            await channel
                .send({ embeds: [embed] })
                .then(() => {
                    logger.log({
                        level: "auto",
                        message: `sent custom countdown (${countdown.id}) in ${guildToSend.name} (${guildID})`,
                    });
                })
                .catch(() => {
                    logger.error(`error sending custom countdown (${countdown.id}) ${guildToSend.name} (${guildID})`);
                });

            if (days <= 0) {
                await deleteCountdown(guildID, countdown.id);
            }
        }
    };

    setTimeout(async () => {
        setInterval(() => {
            runCountdowns();
        }, 86400000);
        runCountdowns();
    }, needed.getTime() - now.getTime());

    logger.log({
        level: "auto",
        message: `custom countdowns will run in ${MStoTime(needed.getTime() - now.getTime())}`,
    });
}

export function runChristmas(client: Client) {
    const now = new Date();

    let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`;

    if (now.getHours() < 3) {
        d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`;
    }

    const needed = new Date(Date.parse(d) + 10800000);

    const runChristmasThing = async () => {
        const query = await prisma.guildChristmas.findMany({
            where: {
                enabled: true,
            },
        });

        for (const profile of query) {
            const guild = client.guilds.cache.find((g) => g.id == profile.guildId);
            if (!guild) continue;
            const channel = guild.channels.cache.find((c) => c.id == profile.channel);

            if (!channel) {
                profile.enabled = false;
                profile.channel = "none";
                await setChristmasCountdown(guild, profile);
                continue;
            }

            let format = profile.format;

            const days = daysUntilChristmas();

            format = format.split("%days%").join(daysUntilChristmas().toString());

            if (days == "ITS CHRISTMAS") {
                format = "MERRY CHRISTMAS EVERYONE I HOPE YOU HAVE A FANTASTIC DAY WOO";
            }

            if (!(channel instanceof BaseGuildTextChannel)) continue;

            await channel
                .send({
                    embeds: [new CustomEmbed().setDescription(format).setColor("#ff0000").setTitle(":santa_tone1:")],
                })
                .then(() => {
                    logger.log({
                        level: "auto",
                        message: `sent christmas countdown in ${guild.name} ~ ${format}`,
                    });
                })
                .catch(async () => {
                    logger.error(`error sending christmas countdown in ${guild.name}`);
                    profile.enabled = false;
                    profile.channel = "none";
                    await setChristmasCountdown(guild, profile);
                });
        }
    };

    setTimeout(async () => {
        setInterval(() => {
            runChristmasThing();
        }, 86400000);
        runChristmasThing();
    }, needed.getTime() - now.getTime());

    logger.log({
        level: "auto",
        message: `christmas countdowns will run in ${MStoTime(needed.getTime() - now.getTime())}`,
    });
}
