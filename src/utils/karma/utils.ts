import { GuildMember } from "discord.js";
import ms = require("ms");
import prisma from "../database/database";
import redis from "../database/redis";
import { MStoTime } from "../functions/date";
import { logger } from "../logger";
import { createProfile } from "../users/utils";

let karmaShop = false;

/**
 *
 * @param {GuildMember} member
 * @returns {Number}
 */
export async function getKarma(member: GuildMember | string): Promise<number> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (await redis.exists(`cache:user:karma:${id}`)) return parseInt(await redis.get(`cache:user:karma:${id}`));

    const query = await prisma.user.findUnique({
        where: {
            id: id,
        },
        select: {
            karma: true,
        },
    });

    if (!query) {
        if (member instanceof GuildMember) {
            await createProfile(member.user);
        } else {
            await createProfile(id);
        }
        return 1;
    } else {
        await redis.set(`cache:user:karma:${id}`, query.karma);
        await redis.expire(`cache:user:karma:${id}`, 300);
        return query.karma;
    }
}

/**
 *
 * @param {GuildMember} member
 * @param {Number} amount
 */
export async function addKarma(member: GuildMember | string, amount: number) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await redis.del(`cache:user:karma:${id}`);

    await prisma.user.update({
        where: {
            id: id,
        },
        data: {
            karma: { increment: amount },
        },
    });
}

/**
 *
 * @param {GuildMember} member
 * @param {Number} amount
 */
export async function removeKarma(member: GuildMember | string, amount: number) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await redis.del(`cache:user:karma:${id}`);

    await prisma.user.update({
        where: {
            id: id,
        },
        data: {
            karma: { decrement: amount },
        },
    });
}

/**
 *
 * @param {GuildMember} member
 */
export async function updateLastCommand(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const date = Date.now();

    await redis.set(`cache:user:lastcmd:${id}`, date);

    await prisma.user.update({
        where: {
            id: id,
        },
        data: {
            lastCommand: date,
        },
    });
}

/**
 *
 * @returns {Boolean}
 */
export function isKarmaShopOpen(): boolean {
    return karmaShop;
}

export function openKarmaShop() {
    karmaShop = true;
}

export function closeKarmaShop() {
    karmaShop = false;
}

/**
 *
 * @param {GuildMember} member
 * @returns {number}
 */
export async function getLastCommand(member: GuildMember | string): Promise<number> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (await redis.exists(`cache:user:lastcmd:${id}`)) return parseInt(await redis.get(`cache:user:lastcmd:${id}`));

    const query = await prisma.user.findUnique({
        where: {
            id: id,
        },
        select: {
            lastCommand: true,
        },
    });

    if (!query || !query.lastCommand) {
        return 0;
    }

    return query.lastCommand;
}

async function deteriorateKarma() {
    const now = Date.now();

    const threshold = now - ms("7 hours");

    const users = await prisma.user.findMany({
        where: {
            AND: [{ karma: { gt: 1 } }, { lastCommand: { lt: threshold } }],
        },
        select: {
            id: true,
            karma: true,
            lastCommand: true,
        },
    });

    let total = 0;

    for (const user of users) {
        let karmaToRemove = 5;

        if (now - ms("1 week") > user.lastCommand) {
            karmaToRemove = 35;
        }

        if (now - ms("30 days") > user.lastCommand) {
            karmaToRemove = 100;
        }

        if (now - ms("90 days") > user.lastCommand) {
            karmaToRemove = 69420;
        }

        if (karmaToRemove > user.karma) {
            karmaToRemove = user.karma - 1;
        }

        total += karmaToRemove;

        await redis.del(`cache:user:karma:${user.id}`);

        await prisma.user.update({
            where: {
                id: user.id,
            },
            data: {
                karma: { decrement: karmaToRemove },
            },
        });
    }

    logger.log({
        level: "auto",
        message: `${total} total karma deteriorated`,
    });
}

// prettier-ignore
(() => {
    const now = new Date();

    let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`;

    if (now.getHours() < 3) {
        d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`;
    }

    const needed = new Date(Date.parse(d) + 10800000).getTime();

    setTimeout(async () => {
        setInterval(() => {
            deteriorateKarma();
        }, 86400000);
        deteriorateKarma();
    }, needed - now.getTime());

    logger.log({
        level: "auto",
        message: `karma deterioration will run in ${MStoTime(needed - now.getTime())}`
    });
})();
