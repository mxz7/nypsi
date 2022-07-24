import { GuildMember } from "discord.js";
import prisma from "../database/database";
import redis from "../database/redis";
import { createProfile } from "../users/utils";

let karmaShop = false;

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

export async function addKarma(member: GuildMember | string, amount: number) {
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
            karma: { increment: amount },
        },
    });

    await redis.del(`cache:user:karma:${id}`);
}

export async function removeKarma(member: GuildMember | string, amount: number) {
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
            karma: { decrement: amount },
        },
    });

    await redis.del(`cache:user:karma:${id}`);
}

export async function updateLastCommand(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const date = new Date();

    await redis.set(`cache:user:lastcmd:${id}`, date.getTime());

    await prisma.user.update({
        where: {
            id: id,
        },
        data: {
            lastCommand: date,
        },
    });
}

export function isKarmaShopOpen(): boolean {
    return karmaShop;
}

export function openKarmaShop() {
    karmaShop = true;
}

export function closeKarmaShop() {
    karmaShop = false;
}

export async function getLastCommand(member: GuildMember | string): Promise<Date> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (await redis.exists(`cache:user:lastcmd:${id}`))
        return new Date(parseInt(await redis.get(`cache:user:lastcmd:${id}`)));

    const query = await prisma.user.findUnique({
        where: {
            id: id,
        },
        select: {
            lastCommand: true,
        },
    });

    if (!query || !query.lastCommand) {
        return new Date(0);
    }

    return query.lastCommand;
}
