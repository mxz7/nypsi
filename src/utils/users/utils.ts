import { Collection, Guild, GuildMember, Message, ThreadMember, User } from "discord.js";
import { inPlaceSort } from "fast-sort";
import fetch from "node-fetch";
import prisma from "../database/database";
import redis from "../database/redis";
import { cleanString } from "../functions/string";
import ms = require("ms");

const lastKnownTagCooldown = new Set<string>();

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

    await prisma.user
        .create({
            data: {
                id: id,
                lastKnownTag: username,
                lastCommand: new Date(0),
            },
        })
        .catch(() => {});
    await redis.del(`cache:user:exists:${id}`);
}

export async function updateLastKnowntag(member: GuildMember | string, tag: string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (lastKnownTagCooldown.has(id)) {
        return;
    } else {
        lastKnownTagCooldown.add(id);
        setTimeout(() => {
            lastKnownTagCooldown.delete(id);
        }, ms("1 hour"));
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

    if (await redis.exists(`cache:user:tracking:${id}`)) {
        return (await redis.get(`cache:user:tracking:${id}`)) == "t" ? true : false;
    }

    if (!hasProfile(id)) return undefined;

    const query = await prisma.user.findUnique({
        where: {
            id: id,
        },
        select: {
            tracking: true,
        },
    });

    if (query.tracking) {
        await redis.set(`cache:user:tracking:${id}`, "t");
        await redis.expire(`cache:user:tracking:${id}`, ms("1 hour") / 1000);
        return true;
    } else {
        await redis.set(`cache:user:tracking:${id}`, "f");
        await redis.expire(`cache:user:tracking:${id}`, ms("1 hour") / 1000);
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

    await redis.del(`cache:user:tracking:${id}`);
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

    await redis.del(`cache:user:tracking:${id}`);
}

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
        orderBy: {
            date: "desc",
        },
    });

    inPlaceSort(query).desc((u) => u.date);

    return query;
}

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
            id: true,
        },
        orderBy: {
            date: "desc",
        },
    });

    inPlaceSort(query).desc((u) => u.date);

    return query;
}

export async function deleteAvatar(id: string) {
    let res = true;
    await prisma.username
        .delete({
            where: {
                id: id,
            },
        })
        .catch(() => {
            res = false;
        });
    return res;
}

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

    if (await redis.exists(`cache:user:lastfm:${id}`)) {
        return await redis.get(`cache:user:lastfm:${id}`);
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
            await redis.set(`cache:user:lastfm:${id}`, query.lastfmUsername);
            await redis.expire(`cache:user:lastfm:${id}`, ms("1 hour") / 1000);
            return query.lastfmUsername;
        } else {
            return undefined;
        }
    }
}

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

    await redis.del(`cache:user:lastfm:${id}`);

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

export async function fetchUserMentions(guild: Guild, member: GuildMember | string, amount = 100) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const mentions = await prisma.mention.findMany({
        where: {
            AND: [{ guildId: guild.id }, { targetId: id }],
        },
        orderBy: {
            date: "desc",
        },
        take: amount,
    });

    return mentions;
}

export async function deleteUserMentions(guild: Guild, member: GuildMember) {
    await prisma.mention.deleteMany({
        where: {
            AND: [{ guildId: guild.id }, { targetId: member.user.id }],
        },
    });
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
