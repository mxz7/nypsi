import { GuildMember } from "discord.js";
import prisma from "../database/database";
import redis from "../database/redis";
import { formatDate } from "../functions/date";
import { logger } from "../logger";
import { PremUser } from "../models/PremStorage";

declare function require(name: string): any;

const colorCache = new Map();

setInterval(async () => {
    const now = new Date();

    const query = await prisma.premium.findMany({
        where: {
            expireDate: { lte: now },
        },
        select: {
            userId: true,
        },
    });

    for (const user of query) {
        await expireUser(user.userId);
    }
}, 600000);

export async function isPremium(member: GuildMember | string): Promise<boolean> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (await redis.exists(`cache:premium:level:${id}`)) {
        const level = parseInt(await redis.get(`cache:premium:level:${id}`));

        if (level == 0) {
            return false;
        } else {
            return true;
        }
    }

    const query = await prisma.premium.findUnique({
        where: {
            userId: id,
        },
        select: {
            userId: true,
            level: true,
        },
    });

    if (query) {
        if (query.level == 0) {
            await prisma.premium.delete({
                where: {
                    userId: id,
                },
            });
            await redis.set(`cache:premium:level:${id}`, 0);
            await redis.expire(`cache:premium:level:${id}`, 300);
            return false;
        }

        await redis.set(`cache:premium:level:${id}`, query.level);
        await redis.expire(`cache:premium:level:${id}`, 300);
        return true;
    } else {
        await redis.set(`cache:premium:level:${id}`, 0);
        await redis.expire(`cache:premium:level:${id}`, 300);
        return false;
    }
}

export async function getTier(member: GuildMember | string): Promise<number> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (await redis.exists(`cache:premium:level:${id}`)) return parseInt(await redis.get(`cache:premium:level:${id}`));

    const query = await prisma.premium.findUnique({
        where: {
            userId: id,
        },
        select: {
            level: true,
        },
    });

    await redis.set(`cache:premium:level:${id}`, query.level || 0);
    await redis.expire(`cache:premium:level:${id}`, 300);

    return query.level;
}

export async function addMember(member: GuildMember | string, level: number) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const start = new Date();
    const expire = new Date();

    expire.setDate(new Date().getDate() + 35);

    await prisma.premium.create({
        data: {
            userId: id,
            level: level,
            startDate: start,
            expireDate: expire,
            lastDaily: new Date(0),
            lastWeekly: new Date(0),
        },
    });

    const profile = await getPremiumProfile(id);

    logger.info(`premium level ${level} given to ${id}`);

    const { requestDM } = require("../../nypsi");
    requestDM(
        id,
        `you have been given **${profile.getLevelString()}** membership, this will expire on **${formatDate(
            profile.expireDate
        )}**\n\nplease join the support server if you have any problems, or questions. discord.gg/hJTDNST`
    );

    await redis.del(`cache:premium:level:${id}`);
}

export async function getPremiumProfile(member: GuildMember | string): Promise<PremUser> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const query = await prisma.premium.findUnique({
        where: {
            userId: id,
        },
    });

    return createPremUser(query);
}

export async function setTier(member: GuildMember | string, level: number) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await prisma.premium.update({
        where: {
            userId: id,
        },
        data: {
            level: level,
        },
    });

    logger.info(`premium level updated to ${level} for ${id}`);

    const { requestDM } = require("../../nypsi");
    requestDM(id, `your membership has been updated to **${PremUser.getLevelString(level)}**`);

    await redis.del(`cache:premium:level:${id}`);
}

export async function setEmbedColor(member: GuildMember | string, color: string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await prisma.premium.update({
        where: {
            userId: id,
        },
        data: {
            embedColor: color,
        },
    });

    if (colorCache.has(id)) {
        colorCache.delete(id);
    }
}

export async function getEmbedColor(member: string): Promise<`#${string}` | "default"> {
    if (colorCache.has(member)) {
        return colorCache.get(member);
    }

    const query = await prisma.premium.findUnique({
        where: {
            userId: member,
        },
        select: {
            embedColor: true,
        },
    });

    colorCache.set(member, query.embedColor);

    return query.embedColor as `#${string}` | "default";
}

export async function setLastDaily(member: GuildMember | string, date: Date) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await prisma.premium.update({
        where: {
            userId: id,
        },
        data: {
            lastDaily: date,
        },
    });
}

export async function setLastWeekly(member: GuildMember | string, date: Date) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await prisma.premium.update({
        where: {
            userId: id,
        },
        data: {
            lastWeekly: date,
        },
    });
}

export async function setStatus(member: GuildMember | string, status: number) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await prisma.premium.update({
        where: {
            userId: id,
        },
        data: {
            status: status,
        },
    });
}

export async function renewUser(member: string) {
    const profile = await getPremiumProfile(member);

    profile.renew();

    await prisma.premium.update({
        where: {
            userId: member,
        },
        data: {
            expireDate: profile.expireDate,
        },
    });

    const { requestDM } = require("../../nypsi");
    requestDM(member, `your membership has been renewed until **${formatDate(profile.expireDate)}**`);

    await redis.del(`cache:premium:level:${member}`);

    if (colorCache.has(member)) {
        colorCache.delete(member);
    }
}

export async function expireUser(member: string) {
    const profile = await getPremiumProfile(member);

    const expire = await profile.expire();

    if (expire == "boost") {
        return renewUser(member);
    }

    await prisma.premium.delete({
        where: {
            userId: member,
        },
    });

    await prisma.premiumCommand
        .delete({
            where: {
                owner: member,
            },
        })
        .catch(() => {
            // doesnt need to find one
        });

    await redis.del(`cache:premium:level:${member}`);

    if (colorCache.has(member)) {
        colorCache.delete(member);
    }
}

export async function getLastDaily(member: string) {
    const query = await prisma.premium.findUnique({
        where: {
            userId: member,
        },
        select: {
            lastDaily: true,
        },
    });

    return query.lastDaily;
}

export async function getLastWeekly(member: string) {
    const query = await prisma.premium.findUnique({
        where: {
            userId: member,
        },
        select: {
            lastWeekly: true,
        },
    });

    return query.lastWeekly;
}

type PremiumCommand = {
    owner: string;
    trigger: string;
    content: string;
    uses: number;
};

export async function getCommand(name: string): Promise<PremiumCommand> {
    const query = await prisma.premiumCommand.findUnique({
        where: {
            trigger: name,
        },
    });

    if (query) {
        if (!(await isPremium(query.owner))) {
            return undefined;
        }
        return query;
    } else {
        return undefined;
    }
}

export async function getUserCommand(id: string) {
    return await prisma.premiumCommand.findUnique({
        where: {
            owner: id,
        },
    });
}

export async function setCommand(id: string, trigger: string, content: string) {
    const query = await prisma.premiumCommand.findUnique({
        where: {
            owner: id,
        },
        select: {
            owner: true,
        },
    });

    if (query) {
        await prisma.premiumCommand.update({
            where: {
                owner: id,
            },
            data: {
                trigger: trigger,
                content: content,
                uses: 0,
            },
        });
    } else {
        await prisma.premiumCommand.create({
            data: {
                trigger: trigger,
                content: content,
                owner: id,
            },
        });
    }
}

export async function addUse(id: string) {
    await prisma.premiumCommand.update({
        where: {
            owner: id,
        },
        data: {
            uses: { increment: 1 },
        },
    });
}

export async function setExpireDate(member: GuildMember | string, date: Date) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await prisma.premium.update({
        where: {
            userId: id,
        },
        data: {
            expireDate: date,
        },
    });

    const { requestDM } = require("../../nypsi");
    requestDM(id, `your membership will now expire on **${formatDate(date)}**`);
}

export function createPremUser(query: any) {
    return PremUser.fromData({
        id: query.userId,
        level: query.level,
        embedColor: query.embedColor,
        lastDaily: query.lastDaily,
        lastWeekly: query.lastWeekly,
        status: query.status,
        startDate: query.startDate,
        expireDate: query.expireDate,
    });
}
