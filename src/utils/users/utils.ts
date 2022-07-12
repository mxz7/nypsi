import { Collection, Guild, GuildMember, Message, ThreadMember, User } from "discord.js";
import { inPlaceSort } from "fast-sort";
import ms = require("ms");
import fetch from "node-fetch";
import prisma from "../database/database";
import redis from "../database/redis";
import { cleanString } from "../functions/string";

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

    await redis.del(`cache:user:exists:${id}`);
    await prisma.user.create({
        data: {
            id: id,
            lastKnownTag: username,
        },
    });
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
            date: Date.now(),
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
            date: Date.now(),
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

/**
 *
 * @param {GuildMember} member
 * @returns {({username: String}|undefined)}
 */
export function getLastfmUsername(member: GuildMember | string): { username: string } | undefined {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (lastfmUsernameCache.has(id)) {
        return lastfmUsernameCache.get(id);
    } else {
        const query = db.prepare("SELECT username FROM lastfm WHERE id = ?").get(id);

        if (query) {
            lastfmUsernameCache.set(id, query);
        }

        return query;
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

    const query = db.prepare("SELECT id FROM lastfm WHERE id = ?").get(id);

    if (!query) {
        db.prepare("INSERT INTO lastfm (id, username) VALUES (?, ?)").run(id, res.user.name);
    } else {
        db.prepare("UPDATE lastfm SET username = ? WHERE id = ?").run(res.user.name, id);
    }

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

interface WordleStats {
    user: string;
    win1: number;
    win2: number;
    win3: number;
    win4: number;
    win5: number;
    win6: number;
    lose: number;
    history: number[];
}

export function getWordleStats(member: GuildMember): WordleStats | void {
    const query = db.prepare("select * from wordle_stats where user = ?").get(member.user.id);

    if (query) {
        query.history = toArray(query.history);

        return query;
    } else {
        return null;
    }
}

export function addWordleGame(member: GuildMember, win: boolean, attempts?: number, seconds?: number) {
    const profile = getWordleStats(member);

    if (!win) {
        if (profile) {
            db.prepare("update wordle_stats set lose = lose + 1 where user = ?").run(member.user.id);
        } else {
            db.prepare("insert into wordle_stats (user, lose, history) values (?, 1, ?)").run(member.user.id, toStorage([]));
        }
    } else {
        const column = `win${attempts + 1}`;
        if (profile) {
            profile.history.push(seconds);

            if (profile.history.length > 100) profile.history.shift();

            const history = toStorage(profile.history);

            db.prepare(`update wordle_stats set ${column} = ${column} + 1, history = ? where user = ?`).run(
                history,
                member.user.id
            );
        } else {
            const history = toStorage([seconds]);

            db.prepare(`insert into wordle_stats (user, ${column}, history) values (?, 1, ?)`).run(member.user.id, history);
        }
    }
}
