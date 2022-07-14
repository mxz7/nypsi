import Database = require("better-sqlite3");
import { Collection, Guild, GuildMember, Message, ThreadMember, User } from "discord.js";
import { inPlaceSort } from "fast-sort";
import ms = require("ms");
import fetch from "node-fetch";
import prisma from "../database/database";
import redis from "../database/redis";
import { cleanString } from "../functions/string";

const db = new Database("./out/data/storage.db");
const optCache = new Map();
const lastfmUsernameCache = new Map();

export interface MentionQueueItem {
    type: string;
    members?: Collection<string, GuildMember | ThreadMember>;
    channelMembers?: any;
    message?: Message;
    guildId: string;
    url?: string;
    target?: string;
    data?: MentionData;
}

interface MentionData {
    user: string;
    content: string;
    date: number;
    link: string;
}

const mentionQueue: MentionQueueItem[] = [];

export { mentionQueue };

const deleteQueue: Array<string> = [];

export { deleteQueue };

export async function hasProfile(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (await redis.exists(`cache:user:exists:${id}`)) {
        return (await redis.get(`cache:user:exists:${id}`)) === "true" ? true : false;
    }

    const query = await prisma.user.findUnique({
        where: {
            id: id,
        },
        select: {
            id: true,
        },
    });

    if (query) {
        await redis.set(`cache:user:exists:${id}`, "true");
        await redis.expire(`cache:user:exists:${id}`, ms("1 hour") / 1000);
        return true;
    } else {
        await redis.set(`cache:user:exists:${id}`, "false");
        await redis.expire(`cache:user:exists:${id}`, ms("1 hour") / 1000);
        return false;
    }
}

export async function createProfile(member: User | string) {
    let id: string;
    let username = "";
    if (member instanceof User) {
        username = `${member.username}#${member.discriminator}`;
        id = member.id;
    } else {
        id = member;
    }

    await prisma.user.create({
        data: {
            id: id,
            lastKnownTag: username,
        },
    });
    await redis.del(`cache:user:exists:${id}`);
}

export async function updateLastKnowntag(member: GuildMember | string, tag: string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await prisma.user.update({
        where: {
            id: id,
        },
        data: {
            lastKnownTag: tag,
        },
    });
}

export async function getLastKnownTag(id: string) {
    const query = await prisma.user.findUnique({
        where: {
            id: id,
        },
        select: {
            lastKnownTag: true,
        },
    });

    return query.lastKnownTag;
}

export async function isTracking(member: GuildMember | string): Promise<boolean> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (optCache.has(id)) {
        return optCache.get(id);
    }

    const query = await prisma.user.findUnique({
        where: {
            id: id,
        },
        select: {
            tracking: true,
        },
    });

    if (query.tracking) {
        optCache.set(id, true);
        return true;
    } else {
        optCache.set(id, false);
        return false;
    }
}

export async function disableTracking(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await prisma.user.update({
        where: {
            id: id,
        },
        data: {
            tracking: false,
        },
    });

    if (optCache.has(id)) {
        optCache.delete(id);
    }
}

export async function enableTracking(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await prisma.user.update({
        where: {
            id: id,
        },
        data: {
            tracking: true,
        },
    });

    if (optCache.has(id)) {
        optCache.delete(id);
    }
}

/**
 *
 * @param {GuildMember} member
 * @param {String} username
 */
export async function addNewUsername(member: GuildMember | string, username: string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await prisma.username.create({
        data: {
            userId: id,
            value: username,
            date: new Date(),
        },
    });
}

export async function fetchUsernameHistory(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const query = await prisma.username.findMany({
        where: {
            AND: [{ userId: id }, { type: "username" }],
        },
        select: {
            value: true,
            date: true,
        },
    });

    inPlaceSort(query).desc((u) => u.date);

    return query;
}

/**
 *
 * @param {GuildMember} member
 */
export async function clearUsernameHistory(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await prisma.username.deleteMany({
        where: {
            AND: [{ userId: id }, { type: "username" }],
        },
    });
}

/**
 *
 * @param {GuildMember} member
 * @param {String} url
 */
export async function addNewAvatar(member: GuildMember | string, url: string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await prisma.username.create({
        data: {
            userId: id,
            type: "avatar",
            value: url,
            date: new Date(),
        },
    });
}

export async function fetchAvatarHistory(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const query = await prisma.username.findMany({
        where: {
            AND: [{ userId: id }, { type: "avatar" }],
        },
        select: {
            value: true,
            date: true,
        },
    });

    inPlaceSort(query).desc((u) => u.date);

    return query;
}

/**
 *
 * @param {GuildMember} member
 */
export async function clearAvatarHistory(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await prisma.username.deleteMany({
        where: {
            AND: [{ userId: id }, { type: "avatar" }],
        },
    });
}

export async function getLastfmUsername(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (lastfmUsernameCache.has(id)) {
        return lastfmUsernameCache.get(id);
    } else {
        const query = await prisma.user.findUnique({
            where: {
                id: id,
            },
            select: {
                lastfmUsername: true,
            },
        });

        if (query && query.lastfmUsername) {
            lastfmUsernameCache.set(id, query.lastfmUsername);
            return query.lastfmUsername;
        } else {
            return undefined;
        }
    }
}

/**
 *
 * @param {GuildMember} member
 * @param {String} username
 */
export async function setLastfmUsername(member: GuildMember, username: string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    username = cleanString(username);

    const res = await fetch(
        `https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${username}&api_key=${process.env.LASTFM_TOKEN}&format=json`
    ).then((res) => res.json());

    if (res.error && res.error == 6) return false;

    if (lastfmUsernameCache.has(member.user.id)) {
        lastfmUsernameCache.delete(member.user.id);
    }

    await prisma.user.update({
        where: {
            id: id,
        },
        data: {
            lastfmUsername: username,
        },
    });

    return true;
}

/**
 * @param {Guild} guild
 * @param {GuildMember} member
 * @param {Number} amount
 * @returns {Array<{ date: Number, user_tag: String, url: String, content: String }>}
 */
export function fetchUserMentions(
    guild: Guild,
    member: GuildMember | string,
    amount = 100
): Array<{ date: number; user_tag: string; url: string; content: string }> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const mentions = db
        .prepare(
            "SELECT date, user_tag, url, content FROM mentions WHERE guild_id = ? AND target_id = ? ORDER BY date DESC LIMIT ?"
        )
        .all(guild.id, id, amount);

    return mentions;
}

export function deleteUserMentions(guild: Guild, member: GuildMember) {
    db.prepare("DELETE FROM mentions WHERE guild_id = ? AND target_id = ?").run(guild.id, member.user.id);
}

export async function getWordleStats(member: GuildMember) {
    const query = await prisma.wordleStats.findUnique({
        where: {
            userId: member.user.id,
        },
    });

    return query;
}

export async function addWordleGame(member: GuildMember, win: boolean, attempts?: number, seconds?: number) {
    const profile = await getWordleStats(member);

    if (!win) {
        if (profile) {
            await prisma.wordleStats.update({
                where: {
                    userId: member.user.id,
                },
                data: {
                    lose: { increment: 1 },
                },
            });
        } else {
            await prisma.wordleStats.create({
                data: {
                    userId: member.user.id,
                    lose: 1,
                },
            });
        }
    } else {
        if (profile) {
            profile.history.push(seconds);

            if (profile.history.length > 100) profile.history.shift();

            let data;

            switch (attempts) {
                case 0:
                    data = {
                        win1: { increment: 1 },
                        history: profile.history,
                    };
                    break;
                case 1:
                    data = {
                        win2: { increment: 1 },
                        history: profile.history,
                    };
                    break;
                case 2:
                    data = {
                        win3: { increment: 1 },
                        history: profile.history,
                    };
                    break;
                case 3:
                    data = {
                        win4: { increment: 1 },
                        history: profile.history,
                    };
                    break;
                case 4:
                    data = {
                        win5: { increment: 1 },
                        history: profile.history,
                    };
                    break;
                case 5:
                    data = {
                        win6: { increment: 1 },
                        history: profile.history,
                    };
                    break;
            }

            await prisma.wordleStats.update({
                where: {
                    userId: member.user.id,
                },
                data: data,
            });
        } else {
            let data;

            switch (attempts) {
                case 0:
                    data = {
                        userId: member.user.id,
                        win1: 1,
                        history: [seconds],
                    };
                    break;
                case 1:
                    data = {
                        userId: member.user.id,
                        win2: 1,
                        history: [seconds],
                    };
                    break;
                case 2:
                    data = {
                        userId: member.user.id,
                        win3: 1,
                        history: [seconds],
                    };
                    break;
                case 3:
                    data = {
                        userId: member.user.id,
                        win4: 1,
                        history: [seconds],
                    };
                    break;
                case 4:
                    data = {
                        userId: member.user.id,
                        win5: 1,
                        history: [seconds],
                    };
                    break;
                case 5:
                    data = {
                        userId: member.user.id,
                        win6: 1,
                        history: [seconds],
                    };
                    break;
            }

            await prisma.wordleStats.create({
                data: data,
            });
        }
    }
}
