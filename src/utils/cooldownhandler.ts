import { GuildMember } from "discord.js";
import redis from "./database/redis";
import { getBoosters, getItems } from "./economy/utils";
import { getPrefix } from "./guilds/utils";
import { ErrorEmbed } from "./models/EmbedBuilders";
import { getTier, isPremium } from "./premium/utils";

export async function onCooldown(cmd: string, member: GuildMember): Promise<boolean> {
    const key = `cd:${cmd}:${member.user.id}`;

    const res = await redis.exists(key);

    return res == 1 ? true : false;
}

export async function addCooldown(cmd: string, member: GuildMember, seconds?: number) {
    const key = `cd:${cmd}:${member.user.id}`;

    let expireDisabled = false;

    if (!seconds) {
        expireDisabled = true;
        seconds = 69420;
    }

    const expire = await calculateCooldownLength(seconds, member);

    const data: CooldownData = {
        date: Date.now(),
        length: expire,
    };

    await redis.set(key, JSON.stringify(data));
    if (!expireDisabled) await redis.expire(key, expire);
}

export async function addExpiry(cmd: string, member: GuildMember, seconds: number) {
    const key = `cd:${cmd}:${member.user.id}`;

    const expire = await calculateCooldownLength(seconds, member);

    const data: CooldownData = {
        date: Date.now(),
        length: expire,
    };

    await redis.set(key, JSON.stringify(data));
    await redis.expire(key, expire);
}

export async function getResponse(cmd: string, member: GuildMember): Promise<ErrorEmbed> {
    const key = `cd:${cmd}:${member.user.id}`;
    const cd: CooldownData = JSON.parse(await redis.get(key));

    if (!cd) {
        return new ErrorEmbed("you are on cooldown for `0.1s`").removeTitle();
    }

    const init = cd.date;
    const length = cd.length;

    const diff = (Date.now() - init) / 1000;
    const time = length - diff;

    const minutes = Math.floor(time / 60);
    const seconds = (time - minutes * 60).toFixed(1);

    let remaining: string;

    if (minutes != 0) {
        remaining = `${minutes}m${Math.floor(parseFloat(seconds))}s`;
    } else {
        remaining = `${seconds}s`;
    }

    const embed = new ErrorEmbed(`you are on cooldown for \`${remaining}\``).removeTitle();

    const random = Math.floor(Math.random() * 50);

    if (random == 7 && !(await isPremium(member))) {
        embed.setFooter({ text: `premium members get 50% shorter cooldowns (${await getPrefix(member.guild)}donate)` });
    }

    return embed;
}

async function calculateCooldownLength(seconds: number, member: GuildMember): Promise<number> {
    if (await isPremium(member)) {
        if ((await getTier(member)) == 4) {
            seconds = seconds * 0.25;
        } else {
            seconds = seconds * 0.5;
        }
    }

    const boosters = await getBoosters(member);
    const items = getItems();

    if (Array.from(boosters.keys()).includes("redbull")) {
        seconds = seconds * items["redbull"].boosterEffect.effect;
    }

    if (seconds < 2) seconds = 2;

    return Math.ceil(seconds);
}

interface CooldownData {
    date: number;
    length: number;
}
