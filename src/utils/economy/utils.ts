import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Collection,
    Guild,
    GuildMember,
    MessageActionRowComponentBuilder,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import * as fs from "fs";
import fetch from "node-fetch";
import prisma from "../database/database";
import redis from "../database/redis";
import requestDM from "../functions/requestdm";
import { logger } from "../logger";
import { NypsiClient } from "../models/Client";
import { Booster, GuildUpgradeRequirements, Item, LotteryTicket } from "../models/Economy";
import { CustomEmbed } from "../models/EmbedBuilders";
import { StatsProfile } from "../models/StatsProfile";
import { getTier, isPremium } from "../premium/utils";
import { createProfile, hasProfile } from "../users/utils";
import workerSort from "../workers/sort";
import { Constructor, getAllWorkers, Worker, WorkerStorageData } from "./workers";
import ms = require("ms");
import _ = require("lodash");

let items: { [key: string]: Item };

const lotteryTicketPrice = 15000;
/**
 * higher ticket price = more favourable to rich people cus poor people cant buy tickets resulting in less tickets overall
 * the goal is to have more tickets overall for a more random outcome
 */
export { lotteryTicketPrice };

export function loadItems(): string {
    let txt = "";

    const b: any = fs.readFileSync("./data/items.json");

    items = JSON.parse(b);

    logger.info(`${Array.from(Object.keys(items)).length.toLocaleString()} economy items loaded`);

    txt += `${Array.from(Object.keys(items)).length.toLocaleString()} economy items loaded`;

    setTimeout(() => {
        updateCryptoWorth();
    }, 50);

    return txt;
}

function randomOffset() {
    return Math.floor(Math.random() * 50000);
}

let padlockPrice = 25000 + randomOffset();

async function updateCryptoWorth() {
    let res = await fetch("https://api.coindesk.com/v1/bpi/currentprice/USD.json").then((res) => res.json());

    const btcworth = Math.floor(res.bpi.USD.rate_float);

    items["bitcoin"].buy = btcworth;
    items["bitcoin"].sell = btcworth;
    logger.info("bitcoin worth updated: $" + items["bitcoin"].buy.toLocaleString());

    res = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=ETH").then((res) => res.json());

    const ethWorth = Math.floor(res.data.rates.USD);

    if (!ethWorth) {
        logger.error("INVALID ETH WORTH");
        return logger.error(res);
    }

    items["ethereum"].buy = ethWorth;
    items["ethereum"].sell = ethWorth;
    logger.info("ethereum worth updated: $" + items["ethereum"].buy.toLocaleString());
}

export function getPadlockPrice(): number {
    return padlockPrice;
}

export function runEconomySetup() {
    setInterval(updateCryptoWorth, 1500000);

    loadItems();

    items["padlock"].buy = padlockPrice;
    items["padlock"].sell = padlockPrice / 3;

    setInterval(() => {
        padlockPrice = 25000 + randomOffset();
        items["padlock"].buy = padlockPrice;
        items["padlock"].sell = padlockPrice / 3;
    }, 3600000);
}

export async function hasVoted(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (await redis.exists(`cache:vote:${id}`)) {
        const res = await redis.get(`cache:vote:${id}`);

        if (res === "true") {
            return true;
        } else {
            return false;
        }
    }

    const now = new Date().getTime();

    const query = await prisma.economy.findUnique({
        where: {
            userId: id,
        },
        select: {
            lastVote: true,
        },
    });

    const lastVote = query.lastVote.getTime();

    if (now - lastVote < 43200000) {
        redis.set(`cache:vote:${id}`, "true");
        redis.expire(`cache:vote:${id}`, ms("30 minutes") / 1000);
        return true;
    } else {
        redis.set(`cache:vote:${id}`, "false");
        redis.expire(`cache:vote:${id}`, ms("1 hour") / 1000);
        return false;
    }
}

export async function getMulti(member: GuildMember | string): Promise<number> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    let multi = 0;

    const voted = await hasVoted(id);

    if (voted) {
        multi += 3;
    }

    const prestige = await getPrestige(member);

    const prestigeBonus = (prestige > 10 ? 10 : prestige) * 2;

    multi += prestigeBonus;

    if (await isPremium(id)) {
        switch (await getTier(id)) {
            case 2:
                multi += 4;
                break;
            case 3:
                multi += 6;
                break;
            case 4:
                multi += 10;
        }
    }

    const guild = await getGuildByUser(id);

    if (guild) {
        multi += guild.level - 1;
    }

    const boosters = await getBoosters(id);

    for (const boosterId of boosters.keys()) {
        if (items[boosterId].boosterEffect.boosts.includes("multi")) {
            multi += items[boosterId].boosterEffect.effect * boosters.get(boosterId).length;
        }
    }

    multi = Math.floor(multi);

    multi = multi / 100;

    return parseFloat(multi.toFixed(2));
}

export async function getUserCount(): Promise<number> {
    const query = await prisma.economy.findMany({
        select: {
            userId: true,
        },
    });

    return query.length;
}

export async function getBalance(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (await redis.exists(`cache:economy:balance:${id}`)) {
        return parseInt(await redis.get(`cache:economy:balance:${id}`));
    }

    const query = await prisma.economy.findUnique({
        where: {
            userId: id,
        },
        select: {
            money: true,
        },
    });

    await redis.set(`cache:economy:balance:${id}`, Number(query.money));
    await redis.expire(`cache:economy:balance:${id}`, 30);

    return Number(query.money);
}

export async function userExists(member: GuildMember | string): Promise<boolean> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (!id) return;

    if (await redis.exists(`cache:economy:exists:${id}`)) {
        return (await redis.get(`cache:economy:exists:${id}`)) === "true" ? true : false;
    }

    const query = await prisma.economy.findUnique({
        where: {
            userId: id,
        },
        select: {
            userId: true,
        },
    });

    if (query) {
        await redis.set(`cache:economy:exists:${id}`, "true");
        await redis.expire(`cache:economy:exists:${id}`, ms("1 hour") / 1000);
        return true;
    } else {
        await redis.set(`cache:economy:exists:${id}`, "false");
        await redis.expire(`cache:economy:exists:${id}`, ms("1 hour") / 1000);
        return false;
    }
}

export async function updateBalance(member: GuildMember | string, amount: number) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await prisma.economy.update({
        where: {
            userId: id,
        },
        data: {
            money: amount,
        },
    });
    await redis.del(`cache:economy:balance:${id}`);
}

export async function getBankBalance(member: GuildMember): Promise<number> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const query = await prisma.economy.findUnique({
        where: {
            userId: id,
        },
        select: {
            bank: true,
        },
    });

    return Number(query.bank);
}

export async function updateBankBalance(member: GuildMember, amount: number) {
    await prisma.economy.update({
        where: {
            userId: member.user.id,
        },
        data: {
            bank: amount,
        },
    });
}

export async function increaseBaseBankStorage(member: GuildMember, amount: number) {
    await prisma.economy.update({
        where: {
            userId: member.user.id,
        },
        data: {
            bankStorage: { increment: amount },
        },
    });
}

export async function getXp(member: GuildMember | string): Promise<number> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (await redis.exists(`cache:economy:xp:${id}`)) {
        return parseInt(await redis.get(`cache:economy:xp:${id}`));
    }

    const query = await prisma.economy.findUnique({
        where: {
            userId: id,
        },
        select: {
            xp: true,
        },
    });

    await redis.set(`cache:economy:xp:${id}`, query.xp);
    await redis.expire(`cache:economy:xp:${id}`, 30);

    return query.xp;
}

export async function updateXp(member: GuildMember, amount: number) {
    if (amount >= 69420) return;

    await prisma.economy.update({
        where: {
            userId: member.user.id,
        },
        data: {
            xp: amount,
        },
    });
    await redis.del(`cache:economy:xp:${member.user.id}`);
}

export async function getMaxBankBalance(member: GuildMember | string): Promise<number> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const base = await prisma.economy
        .findUnique({
            where: {
                userId: id,
            },
            select: {
                bankStorage: true,
            },
        })
        .then((q) => Number(q.bankStorage));

    const xp = await getXp(id);
    const constant = 550;
    const starting = 15000;
    const bonus = xp * constant;
    const max = bonus + starting;

    return max + base;
}

export async function topAmountGlobal(amount: number, client?: NypsiClient, anon = true): Promise<string[]> {
    const query = await prisma.economy.findMany({
        where: {
            money: { gt: 1000 },
        },
        select: {
            userId: true,
            money: true,
            user: {
                select: {
                    lastKnownTag: true,
                },
            },
        },
        orderBy: {
            money: "desc",
        },
    });

    const userIDs: string[] = [];
    const balances = new Map<string, number>();

    for (const user of query) {
        userIDs.push(user.userId);
        balances.set(user.userId, Number(user.money));
    }

    inPlaceSort(userIDs).desc((i) => balances.get(i));

    const usersFinal = [];

    let count = 0;

    for (const user of userIDs) {
        if (count >= amount) break;
        if (usersFinal.join().length >= 1500) break;

        if (balances.get(user) != 0) {
            let pos: number | string = count + 1;

            if (pos == 1) {
                pos = "🥇";
            } else if (pos == 2) {
                pos = "🥈";
            } else if (pos == 3) {
                pos = "🥉";
            }

            let username: string;

            if (client) {
                const res = await client.cluster.broadcastEval(
                    async (c, { userId }) => {
                        const user = await c.users.fetch(userId);

                        if (user) {
                            return user.tag;
                        }
                    },
                    { context: { userId: user } }
                );

                for (const i of res) {
                    if (i.includes("#")) {
                        username = i;
                        break;
                    }
                }
            }

            if (anon) {
                username = username.split("#")[0];
            }

            usersFinal[count] = pos + " **" + username + "** $" + balances.get(user).toLocaleString();
            count++;
        }
    }
    return usersFinal;
}

export async function topAmount(guild: Guild, amount: number): Promise<string[]> {
    let members: Collection<string, GuildMember>;

    if (guild.memberCount == guild.members.cache.size) {
        members = guild.members.cache;
    } else {
        members = await guild.members.fetch();
    }

    if (!members) members = guild.members.cache;

    members = members.filter((m) => {
        return !m.user.bot;
    });

    const query = await prisma.economy.findMany({
        where: {
            money: { gt: 1000 },
        },
        select: {
            userId: true,
            money: true,
        },
        orderBy: {
            money: "desc",
        },
    });

    let userIDs = [];
    const balances = new Map<string, number>();

    for (const user of query) {
        if (members.has(user.userId)) {
            userIDs.push(user.userId);
            balances.set(user.userId, Number(user.money));
        }
    }

    if (userIDs.length > 500) {
        userIDs = await workerSort(userIDs, balances);
        userIDs.reverse();
    } else {
        inPlaceSort(userIDs).desc((i) => balances.get(i));
    }

    const usersFinal = [];

    let count = 0;

    const getMemberID = (guild: Guild, id: string) => {
        const target = guild.members.cache.find((member) => {
            return member.user.id == id;
        });

        return target;
    };

    for (const user of userIDs) {
        if (count >= amount) break;
        if (usersFinal.join().length >= 1500) break;

        if (balances.get(user) != 0) {
            let pos: number | string = count + 1;

            if (pos == 1) {
                pos = "🥇";
            } else if (pos == 2) {
                pos = "🥈";
            } else if (pos == 3) {
                pos = "🥉";
            }

            usersFinal[count] =
                pos + " **" + getMemberID(guild, user).user.tag + "** $" + balances.get(user).toLocaleString();
            count++;
        }
    }
    return usersFinal;
}

export async function topAmountItem(guild: Guild, amount: number, item: string): Promise<string[]> {
    let members: Collection<string, GuildMember>;

    if (guild.memberCount == guild.members.cache.size) {
        members = guild.members.cache;
    } else {
        members = await guild.members.fetch();
    }

    if (!members) members = guild.members.cache;

    members = members.filter((m) => {
        return !m.user.bot;
    });

    const query = await prisma.economy.findMany({
        where: {
            money: { gt: 1000 },
        },
        select: {
            userId: true,
            inventory: true,
        },
        orderBy: {
            money: "desc",
        },
    });

    let userIDs = [];
    const amounts = new Map<string, number>();

    for (const user of query) {
        const inventory = user.inventory as Inventory;
        if (members.has(user.userId)) {
            if (!inventory[item]) continue;
            userIDs.push(user.userId);
            amounts.set(user.userId, inventory[item]);
        }
    }

    if (userIDs.length > 500) {
        userIDs = await workerSort(userIDs, amounts);
        userIDs.reverse();
    } else {
        inPlaceSort(userIDs).desc((i) => amounts.get(i));
    }

    const usersFinal = [];

    let count = 0;

    const getMemberID = (guild: Guild, id: string) => {
        const target = guild.members.cache.find((member) => {
            return member.user.id == id;
        });

        return target;
    };

    for (const user of userIDs) {
        if (count >= amount) break;
        if (usersFinal.join().length >= 1500) break;

        if (amounts.get(user) != 0) {
            let pos: number | string = count + 1;

            if (pos == 1) {
                pos = "🥇";
            } else if (pos == 2) {
                pos = "🥈";
            } else if (pos == 3) {
                pos = "🥉";
            }

            usersFinal[count] =
                pos +
                " **" +
                getMemberID(guild, user).user.tag +
                "** " +
                amounts.get(user).toLocaleString() +
                ` ${items[item].name}${amounts.get(user) > 1 ? "s" : ""}`;
            count++;
        }
    }
    return usersFinal;
}

export async function bottomAmount(guild: Guild, amount: number): Promise<string[]> {
    let members: Collection<string, GuildMember>;

    if (guild.memberCount == guild.members.cache.size) {
        members = guild.members.cache;
    } else {
        members = await guild.members.fetch();
    }

    if (!members) members = guild.members.cache;

    members = members.filter((m) => {
        return !m.user.bot;
    });

    const query = await prisma.economy.findMany({
        where: {
            money: { gt: 1000 },
        },
        select: {
            userId: true,
            money: true,
        },
        orderBy: {
            money: "asc",
        },
    });

    let userIDs = [];
    const balances = new Map<string, number>();

    for (const user of query) {
        if (members.find((member) => member.user.id == user.userId)) {
            userIDs.push(user.userId);
            balances.set(user.userId, Number(user.money));
        }
    }

    if (userIDs.length > 500) {
        userIDs = await workerSort(userIDs, balances);
    } else {
        inPlaceSort(userIDs).asc((i) => balances.get(i));
    }

    const usersFinal = [];

    let count = 0;

    const getMemberID = (guild: Guild, id: string) => {
        const target = guild.members.cache.find((member) => {
            return member.user.id == id;
        });

        return target;
    };

    for (const user of userIDs) {
        if (count >= amount) break;
        if (usersFinal.join().length >= 1500) break;

        if (balances.get(user) != 0) {
            let pos: number | string = count + 1;

            if (pos == 1) {
                pos = "🥇";
            } else if (pos == 2) {
                pos = "🥈";
            } else if (pos == 3) {
                pos = "🥉";
            }

            usersFinal[count] =
                pos + " **" + getMemberID(guild, user).user.tag + "** $" + balances.get(user).toLocaleString();
            count++;
        }
    }

    return usersFinal;
}

export async function topAmountPrestige(guild: Guild, amount: number): Promise<string[]> {
    let members: Collection<string, GuildMember>;

    if (guild.memberCount == guild.members.cache.size) {
        members = guild.members.cache;
    } else {
        members = await guild.members.fetch();
    }

    if (!members) members = guild.members.cache;

    members = members.filter((m) => {
        return !m.user.bot;
    });

    const query = await prisma.economy.findMany({
        where: {
            prestige: { gt: 0 },
        },
        select: {
            userId: true,
            prestige: true,
        },
        orderBy: {
            prestige: "desc",
        },
    });

    let userIDs = [];
    const prestiges = new Map<string, number>();

    for (const user of query) {
        if (members.find((member) => member.user.id == user.userId)) {
            userIDs.push(user.userId);
            prestiges.set(user.userId, user.prestige);
        }
    }

    if (userIDs.length > 500) {
        userIDs = await workerSort(userIDs, prestiges);
    } else {
        inPlaceSort(userIDs).desc((i) => prestiges.get(i));
    }

    const usersFinal = [];

    let count = 0;

    const getMemberID = (guild: Guild, id: string) => {
        const target = guild.members.cache.find((member) => {
            return member.user.id == id;
        });

        return target;
    };

    for (const user of userIDs) {
        if (count >= amount) break;
        if (usersFinal.join().length >= 1500) break;

        if (prestiges.get(user) != 0) {
            let pos: string | number = count + 1;

            if (pos == 1) {
                pos = "🥇";
            } else if (pos == 2) {
                pos = "🥈";
            } else if (pos == 3) {
                pos = "🥉";
            }

            const thing = ["th", "st", "nd", "rd"];
            const v = prestiges.get(user) % 100;
            usersFinal[count] =
                pos +
                " **" +
                getMemberID(guild, user).user.tag +
                "** " +
                prestiges.get(user) +
                (thing[(v - 20) % 10] || thing[v] || thing[0]) +
                " prestige";
            count++;
        }
    }
    return usersFinal;
}

export async function createUser(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (!(await hasProfile(id))) {
        if (member instanceof GuildMember) {
            await createProfile(member.user);
        } else {
            await createProfile(id);
        }
    }

    await prisma.economy.create({
        data: {
            userId: id,
            lastVote: new Date(0),
            lastDaily: new Date(0),
        },
    });
    await redis.del(`cache:economy:exists:${id}`);
}

export async function formatBet(bet: string | number, member: GuildMember): Promise<number | void> {
    const maxBet = await calcMaxBet(member);

    if (bet.toString().toLowerCase() == "all") {
        bet = await getBalance(member);
        if (bet > maxBet) {
            bet = maxBet;
        }
    } else if (bet.toString().toLowerCase() == "max") {
        bet = maxBet;
    } else if (bet.toString().toLowerCase() == "half") {
        bet = Math.floor((await getBalance(member)) / 2);
    }

    const formatted = formatNumber(bet.toString());

    if (formatted) {
        bet = formatted;
    } else {
        return null;
    }

    if (bet <= 0) return null;

    return bet;
}

export function formatNumber(number: string | number): number | void {
    if (number.toString().includes("b")) {
        number = parseFloat(number.toString()) * 1000000000;
    } else if (number.toString().includes("m")) {
        number = parseFloat(number.toString()) * 1000000;
    } else if (number.toString().includes("k")) {
        number = parseFloat(number.toString()) * 1000;
    }

    if (isNaN(parseFloat(number.toString()))) return null;

    return Math.floor(parseFloat(number.toString()));
}

export async function hasPadlock(member: GuildMember): Promise<boolean> {
    const query = await prisma.economy.findUnique({
        where: {
            userId: member.user.id,
        },
        select: {
            padlock: true,
        },
    });

    return query.padlock;
}

export async function setPadlock(member: GuildMember, setting: boolean) {
    await prisma.economy.update({
        where: {
            userId: member.user.id,
        },
        data: {
            padlock: setting,
        },
    });
}

export async function getDefaultBet(member: GuildMember): Promise<number> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (await redis.exists(`cache:economy:defaultbet:${id}`)) {
        return parseInt(await redis.get(`cache:economy:defaultbet:${id}`));
    }

    const query = await prisma.economy.findUnique({
        where: {
            userId: id,
        },
        select: {
            defaultBet: true,
        },
    });

    await redis.set(`cache:economy:defaultbet:${id}`, query.defaultBet);
    await redis.expire(`cache:economy:defaultbet:${id}`, 3600);

    return query.defaultBet;
}

export async function setDefaultBet(member: GuildMember, setting: number) {
    await prisma.economy.update({
        where: {
            userId: member.user.id,
        },
        data: {
            defaultBet: setting,
        },
    });

    await redis.del(`cache:economy:defaultbet:${member.user.id}`);
}

export async function getPrestige(member: GuildMember | string): Promise<number> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (await redis.exists(`cache:economy:prestige:${id}`)) {
        return parseInt(await redis.get(`cache:economy:prestige:${id}`));
    }

    const query = await prisma.economy.findUnique({
        where: {
            userId: id,
        },
        select: {
            prestige: true,
        },
    });

    await redis.set(`cache:economy:prestige:${id}`, query.prestige);
    await redis.expire(`cache:economy:prestige:${id}`, ms("1 hour") / 1000);

    return query.prestige;
}

export async function setPrestige(member: GuildMember, amount: number) {
    await prisma.economy.update({
        where: {
            userId: member.user.id,
        },
        data: {
            prestige: amount,
        },
    });

    await redis.del(`cache:economy:prestige:${member.user.id}`);
}

export async function getPrestigeRequirement(member: GuildMember): Promise<number> {
    const constant = 500;
    const extra = (await getPrestige(member)) * constant;

    return 500 + extra;
}

export function getPrestigeRequirementBal(xp: number): number {
    const constant = 500;
    const bonus = xp * constant;

    return bonus;
}

export async function getDMsEnabled(member: GuildMember | string): Promise<boolean> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (!(await userExists(id))) await createUser(id);

    const query = await prisma.economy.findUnique({
        where: {
            userId: id,
        },
        select: {
            dms: true,
        },
    });

    return query.dms;
}

export async function setDMsEnabled(member: GuildMember, value: boolean) {
    await prisma.economy.update({
        where: {
            userId: member.user.id,
        },
        data: {
            dms: value,
        },
    });
}

export async function calcMaxBet(member: GuildMember): Promise<number> {
    const base = 100000;
    const voted = await hasVoted(member);
    const bonus = 50000;

    let total = base;

    if (voted) {
        total += 50000;
    }

    const prestige = await getPrestige(member);

    return total + bonus * (prestige > 15 ? 15 : prestige);
}

export async function getWorkers(member: GuildMember | string): Promise<{ [key: string]: WorkerStorageData }> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const query = await prisma.economy.findUnique({
        where: {
            userId: id,
        },
        select: {
            workers: true,
        },
    });

    return query.workers as any;
}

export async function addWorker(member: GuildMember, id: number) {
    let memberID: string;
    if (member instanceof GuildMember) {
        memberID = member.user.id;
    } else {
        memberID = member;
    }

    const workers = getAllWorkers();

    let worker: Constructor<Worker> | Worker = workers.get(id);

    if (!worker) return;

    worker = new worker();

    const memberWorkers = await getWorkers(member);

    memberWorkers[id] = worker.toStorage();

    await prisma.economy.update({
        where: {
            userId: memberID,
        },
        data: {
            workers: memberWorkers as any,
        },
    });
}

export async function emptyWorkersStored(member: GuildMember | string) {
    let memberID: string;
    if (member instanceof GuildMember) {
        memberID = member.user.id;
    } else {
        memberID = member;
    }

    const workers = await getWorkers(memberID);

    for (const w of Object.keys(workers)) {
        workers[w].stored = 0;
    }

    await prisma.economy.update({
        where: {
            userId: memberID,
        },
        data: {
            workers: workers as any,
        },
    });
}

export async function upgradeWorker(member: GuildMember | string, id: string) {
    let memberID: string;
    if (member instanceof GuildMember) {
        memberID = member.user.id;
    } else {
        memberID = member;
    }

    const workers = await getWorkers(memberID);

    const worker = Worker.fromStorage(workers[id]);

    worker.upgrade();

    workers[id] = worker.toStorage();

    await prisma.economy.update({
        where: {
            userId: memberID,
        },
        data: {
            workers: workers as any,
        },
    });
}

export async function isEcoBanned(id: string) {
    if (await redis.exists(`cache:economy:banned:${id}`)) {
        return (await redis.get(`cache:economy:banned:${id}`)) === "t" ? true : false;
    } else {
        const query = await prisma.economy.findUnique({
            where: {
                userId: id,
            },
            select: {
                banned: true,
            },
        });

        if (!query) {
            await redis.set(`cache:economy:banned:${id}`, "f");
            await redis.expire(`cache:economy:banned:${id}`, ms("1 hour") / 1000);
            return false;
        }

        if (query.banned) {
            await redis.set(`cache:economy:banned:${id}`, "t");
            await redis.expire(`cache:economy:banned:${id}`, ms("1 hour") / 1000);
            return true;
        } else {
            await redis.set(`cache:economy:banned:${id}`, "f");
            await redis.expire(`cache:economy:banned:${id}`, ms("1 hour") / 1000);
            return false;
        }
    }
}

export async function toggleBan(id: string) {
    if (await isEcoBanned(id)) {
        await prisma.economy.update({
            where: {
                userId: id,
            },
            data: {
                banned: false,
            },
        });
    } else {
        await prisma.economy.update({
            where: {
                userId: id,
            },
            data: {
                banned: true,
            },
        });
    }

    await redis.del(`cache:economy:banned:${id}`);
}

export async function reset() {
    await prisma.lotteryTicket.deleteMany();
    await prisma.$executeRaw`ALTER SEQUENCE "LotteryTicket_id_seq" RESTART WITH 1;`;
    await prisma.booster.deleteMany();
    await prisma.economyStats.deleteMany();
    await prisma.economyGuildMember.deleteMany();
    await prisma.economyGuild.deleteMany();

    await prisma.economy.deleteMany({
        where: {
            banned: true,
        },
    });

    const deleted = await prisma.economy
        .deleteMany({
            where: {
                AND: [{ prestige: 0 }, { lastVote: { lt: new Date(Date.now() - ms("12 hours")) } }, { dms: true }],
            },
        })
        .then((r) => r.count);

    const query = await prisma.economy.findMany();
    let updated = 0;

    for (const user of query) {
        await prisma.economy.update({
            where: {
                userId: user.userId,
            },
            data: {
                money: 500,
                bank: 9500,
                bankStorage: 5000,
                defaultBet: 0,
                xp: 0,
                padlock: false,
                inventory: {},
                workers: {},
            },
        });

        updated++;

        await redis.del(`cache:economy:exists:${user.userId}`);
        await redis.del(`cache:economy:banned:${user.userId}`);
        await redis.del(`cache:economy:prestige:${user.userId}`);
        await redis.del(`cache:economy:exists:${user.userId}`);
        await redis.del(`cache:economy:xp:${user.userId}`);
        await redis.del(`cache:economy:balance:${user.userId}`);
        await redis.del(`cache:economy:boosters:${user.userId}`);
        await redis.del(`economy:handcuffed:${user.userId}`);
        await redis.del(`cache:economy:guild:user:${user.userId}`);
    }

    return updated + deleted;
}

export async function getStats(member: GuildMember): Promise<StatsProfile> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const query = await prisma.economyStats.findMany({
        where: {
            economyUserId: id,
        },
        orderBy: {
            win: "desc",
        },
    });

    return new StatsProfile(query);
}

export async function addGamble(member: GuildMember, game: string, win: boolean) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const query = await prisma.economyStats.findFirst({
        where: {
            AND: [{ economyUserId: id }, { type: game }],
        },
        select: {
            economyUserId: true,
        },
    });

    if (query) {
        if (win) {
            await prisma.economyStats.updateMany({
                where: {
                    AND: [{ economyUserId: id }, { type: game }],
                },
                data: {
                    win: { increment: 1 },
                },
            });
        } else {
            await prisma.economyStats.updateMany({
                where: {
                    AND: [{ economyUserId: id }, { type: game }],
                },
                data: {
                    lose: { increment: 1 },
                },
            });
        }
    } else {
        if (win) {
            await prisma.economyStats.create({
                data: {
                    economyUserId: id,
                    type: game,
                    win: 1,
                    gamble: true,
                },
            });
        } else {
            await prisma.economyStats.create({
                data: {
                    economyUserId: id,
                    type: game,
                    lose: 1,
                    gamble: true,
                },
            });
        }
    }
}

export async function addRob(member: GuildMember, win: boolean) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const query = await prisma.economyStats.findFirst({
        where: {
            AND: [{ economyUserId: id }, { type: "rob" }],
        },
        select: {
            economyUserId: true,
        },
    });

    if (query) {
        if (win) {
            await prisma.economyStats.updateMany({
                where: {
                    AND: [{ economyUserId: id }, { type: "rob" }],
                },
                data: {
                    win: { increment: 1 },
                },
            });
        } else {
            await prisma.economyStats.updateMany({
                where: {
                    AND: [{ economyUserId: id }, { type: "rob" }],
                },
                data: {
                    lose: { increment: 1 },
                },
            });
        }
    } else {
        if (win) {
            await prisma.economyStats.create({
                data: {
                    economyUserId: id,
                    type: "rob",
                    win: 1,
                    gamble: true,
                },
            });
        } else {
            await prisma.economyStats.create({
                data: {
                    economyUserId: id,
                    type: "rob",
                    lose: 1,
                    gamble: true,
                },
            });
        }
    }
}

export async function addItemUse(member: GuildMember, item: string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const query = await prisma.economyStats.findFirst({
        where: {
            AND: [{ economyUserId: id, type: item }],
        },
        select: {
            economyUserId: true,
        },
    });

    if (query) {
        await prisma.economyStats.updateMany({
            where: {
                AND: [{ economyUserId: id }, { type: item }],
            },
            data: {
                win: { increment: 1 },
            },
        });
    } else {
        await prisma.economyStats.create({
            data: {
                economyUserId: id,
                type: item,
                win: 1,
                gamble: false,
            },
        });
    }
}

type Inventory = { [key: string]: number };

export async function getInventory(member: GuildMember | string): Promise<Inventory> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    if (await redis.exists(`cache:economy:inventory:${id}`)) {
        return JSON.parse(await redis.get(`cache:economy:inventory:${id}`));
    }

    const query = await prisma.economy
        .findUnique({
            where: {
                userId: id,
            },
            select: {
                inventory: true,
            },
        })
        .catch();

    if (!query) {
        if (!(await userExists(id))) await createUser(id);
        await redis.set(`cache:economy:inventory:${id}`, "{}");
        await redis.expire(`cache:economy:inventory:${id}`, 180);
        return {};
    }

    if (!query.inventory) {
        await redis.set(`cache:economy:inventory:${id}`, "{}");
        await redis.expire(`cache:economy:inventory:${id}`, 180);
        return {};
    }

    await redis.set(`cache:economy:inventory:${id}`, JSON.stringify(query.inventory));
    await redis.expire(`cache:economy:inventory:${id}`, 180);
    return query.inventory as Inventory;
}

export async function setInventory(member: GuildMember | string, inventory: object) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await prisma.economy.update({
        where: {
            userId: id,
        },
        data: {
            inventory: inventory,
        },
    });

    await redis.del(`cache:economy:inventory:${id}`);
}

export function getItems(): { [key: string]: Item } {
    return items;
}

export async function getMaxBitcoin(member: GuildMember): Promise<number> {
    const base = 10;

    const prestige = await getPrestige(member);

    const prestigeBonus = 5 * (prestige > 15 ? 15 : prestige);

    let xpBonus = 1 * Math.floor((await getXp(member)) / 100);

    if (xpBonus > 5) xpBonus = 5;

    return base + prestigeBonus + xpBonus;
}

export async function getMaxEthereum(member: GuildMember): Promise<number> {
    return (await getMaxBitcoin(member)) * 10;
}

export async function deleteUser(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const guild = await getGuildByUser(member);

    if (guild) {
        if (guild.ownerId == id) {
            await prisma.economyGuildMember.deleteMany({
                where: { guildName: guild.guildName },
            });

            await prisma.economyGuild.delete({
                where: {
                    guildName: guild.guildName,
                },
            });
        } else {
            await prisma.economyGuildMember.delete({
                where: {
                    userId: id,
                },
            });
        }
    }

    await prisma.booster.deleteMany({
        where: { userId: id },
    });
    await prisma.economyStats.deleteMany({
        where: {
            economyUserId: id,
        },
    });
    await prisma.economy.delete({
        where: {
            userId: id,
        },
    });

    await redis.del(`cache:economy:exists:${id}`);
    await redis.del(`cache:economy:banned:${id}`);
    await redis.del(`cache:economy:prestige:${id}`);
    await redis.del(`cache:economy:exists:${id}`);
    await redis.del(`cache:economy:xp:${id}`);
    await redis.del(`cache:economy:balance:${id}`);
    await redis.del(`cache:economy:boosters:${id}`);
    await redis.del(`cache:economy:guild:user:${id}`);
}

export async function getTickets(member: GuildMember | string): Promise<LotteryTicket[]> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const query = await prisma.lotteryTicket.findMany({
        where: {
            userId: id,
        },
    });

    return query;
}

export async function addTicket(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await prisma.lotteryTicket.create({
        data: {
            userId: id,
        },
    });

    if (!(member instanceof GuildMember)) return;

    await redis.hincrby("lotterytickets:queue", member.user.username, 1);
}

export async function openCrate(member: GuildMember, item: Item): Promise<string[]> {
    const inventory = await getInventory(member);
    const items = getItems();

    const crateItems = [
        "money:10000",
        "money:15000",
        "money:20000",
        "money:50000",
        "money:100000",
        "xp:5",
        "xp:10",
        "xp:15",
        "xp:25",
        "xp:50",
    ];

    for (const i of Array.from(Object.keys(items))) {
        if (
            items[i].role == "fish" ||
            items[i].role == "prey" ||
            items[i].id == "gold_ore" ||
            items[i].id == "iron_ore" ||
            items[i].id == "cobblestone"
        )
            continue;
        crateItems.push(i);
    }

    inventory[item.id] -= 1;

    if (inventory[item.id] == 0) {
        delete inventory[item.id];
    }

    await setInventory(member, inventory);

    let times = 2;
    const names = [];

    if (item.id.includes("vote")) {
        times = 1;
    } else if (item.id.includes("69420")) {
        await updateBalance(member, (await getBalance(member)) + 69420);
        names.push("$69,420");
    }

    for (let i = 0; i < times; i++) {
        const crateItemsModified = [];

        for (const i of crateItems) {
            if (items[i]) {
                if (items[i].rarity == 4) {
                    const chance = Math.floor(Math.random() * 15);
                    if (chance == 4) {
                        crateItemsModified.push(i);
                    }
                } else if (items[i].rarity == 3) {
                    const chance = Math.floor(Math.random() * 3);
                    if (chance == 2) {
                        crateItemsModified.push(i);
                    }
                } else if (items[i].rarity == 2) {
                    crateItemsModified.push(i);
                } else if (items[i].rarity == 1) {
                    for (let x = 0; x < 2; x++) {
                        if (items[i].role == "collectable") {
                            const chance = Math.floor(Math.random() * 3);

                            if (chance == 2) {
                                crateItemsModified.push(i);
                            }
                        } else {
                            crateItemsModified.push(i);
                        }
                        crateItemsModified.push(i);
                    }
                } else if (items[i].rarity == 0) {
                    if (items[i].role == "collectable") {
                        const chance = Math.floor(Math.random() * 3);

                        if (chance == 2) {
                            crateItemsModified.push(i);
                        }
                    } else {
                        crateItemsModified.push(i);
                    }
                    crateItemsModified.push(i);
                }
            } else {
                for (let x = 0; x < 2; x++) {
                    crateItemsModified.push(i);
                    crateItemsModified.push(i);
                }
            }
        }

        const chosen = crateItemsModified[Math.floor(Math.random() * crateItemsModified.length)];

        if (chosen == "bitcoin") {
            const owned = inventory["bitcoin"] || 0;
            const max = await getMaxBitcoin(member);

            if (owned + 1 > max) {
                i--;
                continue;
            } else {
                if (inventory[chosen]) {
                    inventory[chosen] += 1;
                } else {
                    inventory[chosen] = 1;
                }
                names.push(`${items[chosen].emoji} ${items[chosen].name}`);
            }
        } else if (chosen == "ethereum") {
            const owned = inventory["ethereum"] || 0;
            const max = await getMaxEthereum(member);

            if (owned + 1 > max) {
                i--;
                continue;
            } else {
                if (inventory[chosen]) {
                    inventory[chosen] += 1;
                } else {
                    inventory[chosen] = 1;
                }
                names.push(`${items[chosen].emoji} ${items[chosen].name}`);
            }
        } else if (chosen.includes("money:") || chosen.includes("xp:")) {
            if (chosen.includes("money:")) {
                const amount = parseInt(chosen.substr(6));

                await updateBalance(member, (await getBalance(member)) + amount);
                names.push("$" + amount.toLocaleString());
            } else if (chosen.includes("xp:")) {
                const amount = parseInt(chosen.substr(3));

                await updateXp(member, (await getXp(member)) + amount);
                names.push(amount + "xp");
            }
        } else {
            let amount = 1;

            if (chosen == "terrible_fishing_rod" || chosen == "terrible_gun" || chosen == "wooden_pickaxe") {
                amount = 5;
            } else if (chosen == "fishing_rod" || chosen == "gun" || chosen == "iron_pickaxe") {
                amount = 10;
            } else if (chosen == "incredible_fishing_rod" || chosen == "incredible_gun" || chosen == "diamond_pickaxe") {
                amount = 10;
            }

            if (inventory[chosen]) {
                inventory[chosen] += amount;
            } else {
                inventory[chosen] = amount;
            }
            names.push(`${items[chosen].emoji} ${items[chosen].name}`);
        }
    }

    await setInventory(member, inventory);

    return names;
}

export async function getRequiredBetForXp(member: GuildMember): Promise<number> {
    let requiredBet = 1000;

    const prestige = await getPrestige(member);

    if (prestige > 2) requiredBet = 10000;

    requiredBet += prestige * 1000;

    return requiredBet;
}

export async function calcMinimumEarnedXp(member: GuildMember): Promise<number> {
    let earned = 1;
    earned += (await getPrestige(member)) / 1.5;

    let max = 6;

    const guild = await getGuildByUser(member);

    if (guild) {
        max += guild.level - 1;
    }

    if (earned > max) earned = max;

    return Math.floor(earned);
}

export async function calcEarnedXp(member: GuildMember, bet: number): Promise<number> {
    const requiredBet = await getRequiredBetForXp(member);

    if (bet < requiredBet) {
        return 0;
    }

    let earned = await calcMinimumEarnedXp(member);

    const random = Math.floor(Math.random() * 3);

    earned += random;

    let max = 6;

    const guild = await getGuildByUser(member);

    if (guild) {
        max += guild.level - 1;
    }

    if (earned > max) earned = max;

    const boosters = await getBoosters(member);

    let boosterEffect = 0;

    for (const boosterId of boosters.keys()) {
        if (items[boosterId].boosterEffect.boosts.includes("xp")) {
            boosterEffect += items[boosterId].boosterEffect.effect;
        }
    }

    earned += boosterEffect * earned;

    return Math.floor(earned);
}

export async function getGuildByName(name: string) {
    const guild = await prisma.economyGuild
        .findMany({
            where: {
                guildName: {
                    mode: "insensitive",
                    equals: name,
                },
            },
            include: {
                owner: true,
                members: {
                    include: {
                        user: {
                            select: {
                                lastKnownTag: true,
                            },
                        },
                    },
                },
            },
        })
        .then((r) => r[0]);

    return guild;
}

export async function getGuildByUser(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    let guildName: string;

    if (await redis.exists(`cache:economy:guild:user:${id}`)) {
        guildName = await redis.get(`cache:economy:guild:user:${id}`);

        if (guildName == "noguild") return undefined;
    } else {
        const query = await prisma.economyGuildMember.findUnique({
            where: {
                userId: id,
            },
            select: {
                guild: {
                    include: {
                        owner: true,
                        members: {
                            include: {
                                user: {
                                    select: {
                                        lastKnownTag: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!query || !query.guild) {
            await redis.set(`cache:economy:guild:user:${id}`, "noguild");
            await redis.expire(`cache:economy:guild:user:${id}`, ms("1 hour") / 1000);
            return undefined;
        } else {
            await redis.set(`cache:economy:guild:user:${id}`, query.guild.guildName);
            await redis.expire(`cache:economy:guild:user:${id}`, ms("1 hour") / 1000);
        }

        return query.guild;
    }

    return await getGuildByName(guildName);
}

export async function createGuild(name: string, owner: GuildMember) {
    await prisma.economyGuild.create({
        data: {
            guildName: name,
            createdAt: new Date(),
            ownerId: owner.user.id,
        },
    });
    await prisma.economyGuildMember.create({
        data: {
            userId: owner.user.id,
            guildName: name,
            joinedAt: new Date(),
        },
    });

    await redis.del(`cache:economy:guild:user:${owner.user.id}`);
}

export async function deleteGuild(name: string) {
    await prisma.economyGuildMember.deleteMany({
        where: {
            guildName: name,
        },
    });

    await prisma.economyGuild.delete({
        where: {
            guildName: name,
        },
    });
}

export async function addToGuildBank(name: string, amount: number, member: GuildMember, client: NypsiClient) {
    await prisma.economyGuild.update({
        where: {
            guildName: name,
        },
        data: {
            balance: { increment: amount },
        },
    });
    await prisma.economyGuildMember.update({
        where: {
            userId: member.user.id,
        },
        data: {
            contributedMoney: { increment: amount },
        },
    });

    return checkUpgrade(name, client);
}

export async function addToGuildXP(name: string, amount: number, member: GuildMember, client: NypsiClient) {
    await prisma.economyGuild.update({
        where: {
            guildName: name,
        },
        data: {
            xp: { increment: amount },
        },
    });
    await prisma.economyGuildMember.update({
        where: {
            userId: member.user.id,
        },
        data: {
            contributedXp: { increment: amount },
        },
    });

    return checkUpgrade(name, client);
}

export async function getMaxMembersForGuild(name: string) {
    const guild = await getGuildByName(name);

    return guild.level * 3;
}

export async function getRequiredForGuildUpgrade(name: string): Promise<GuildUpgradeRequirements> {
    if (await redis.exists(`cache:economy:guild:requirements:${name}`)) {
        return JSON.parse(await redis.get(`cache:economy:guild:requirements:${name}`));
    }

    const guild = await getGuildByName(name);

    const baseMoney = 5000000 * Math.pow(guild.level, 2);
    const baseXP = 1425 * Math.pow(guild.level, 2);

    const bonusMoney = 100000 * guild.members.length;
    const bonusXP = 75 * guild.members.length;

    await redis.set(
        `cache:economy:guild:requirements:${name}`,
        JSON.stringify({
            money: baseMoney + bonusMoney,
            xp: baseXP + bonusXP,
        })
    );
    await redis.expire(`cache:economy:guild:requirements:${name}`, ms("1 hour") / 1000);

    return {
        money: baseMoney + bonusMoney,
        xp: baseXP + bonusXP,
    };
}

export async function addMember(name: string, member: GuildMember) {
    const guild = await getGuildByName(name);

    if (guild.members.length + 1 > (await getMaxMembersForGuild(guild.guildName))) {
        return false;
    }

    await prisma.economyGuildMember.create({
        data: {
            userId: member.user.id,
            guildName: guild.guildName,
            joinedAt: new Date(),
        },
    });

    await redis.del(`cache:economy:guild:user:${member.user.id}`);

    return true;
}

export enum RemoveMemberMode {
    ID,
    TAG,
}

export async function removeMember(member: string, mode: RemoveMemberMode) {
    if (mode == RemoveMemberMode.ID) {
        await prisma.economyGuildMember.delete({
            where: {
                userId: member,
            },
        });
        await redis.del(`cache:economy:guild:user:${member}`);
        return true;
    } else {
        const user = await prisma.user.findFirst({
            where: {
                lastKnownTag: member,
            },
            select: {
                id: true,
            },
        });

        if (!user || !user.id) {
            return false;
        }

        const x = await prisma.economyGuildMember.delete({
            where: {
                userId: user.id,
            },
        });

        if (x) {
            await redis.del(`cache:economy:guild:user:${x.userId}`);

            return true;
        }
        return false;
    }
}

interface EconomyGuild {
    guildName: string;
    createdAt: Date;
    balance: number;
    xp: number;
    level: number;
    motd: string;
    ownerId: string;
    members?: EconomyGuildMember[];
}

interface EconomyGuildMember {
    userId: string;
    guildName: string;
    joinedAt: Date;
    contributedMoney: number;
    contributedXp: number;
}

async function checkUpgrade(guild: EconomyGuild | string, client: NypsiClient): Promise<boolean> {
    if (typeof guild == "string") {
        guild = await getGuildByName(guild);
    }

    if (guild.level == 5) return;
    const requirements = await getRequiredForGuildUpgrade(guild.guildName);

    if (guild.balance >= requirements.money && guild.xp >= requirements.xp) {
        await prisma.economyGuild.update({
            where: {
                guildName: guild.guildName,
            },
            data: {
                level: { increment: 1 },
                balance: { decrement: requirements.money },
                xp: { decrement: requirements.xp },
            },
        });

        logger.info(`${guild.guildName} has upgraded to level ${guild.level + 1}`);

        await redis.del(`cache:economy:guild:requirements:${guild.guildName}`);

        const embed = new CustomEmbed().setColor("#5efb8f");

        embed.setHeader(guild.guildName);
        embed.setDescription(
            `**${guild.guildName}** has upgraded to level **${guild.level + 1}**\n\nyou have received:` +
                `\n +**${guild.level}** basic crates` +
                "\n +**1**% multiplier" +
                "\n +**1** max xp gain"
        );
        embed.disableFooter();

        for (const member of guild.members) {
            const inventory = await getInventory(member.userId);

            if (inventory["basic_crate"]) {
                inventory["basic_crate"] += guild.level;
            } else {
                inventory["basic_crate"] = guild.level;
            }

            await setInventory(member.userId, inventory);

            if (await getDMsEnabled(member.userId)) {
                await requestDM({
                    memberId: member.userId,
                    client: client,
                    content: `${guild.guildName} has been upgraded!`,
                    embed: embed,
                });
            }
        }

        return true;
    }
    return false;
}

export async function setGuildMOTD(name: string, motd: string) {
    await prisma.economyGuild.update({
        where: {
            guildName: name,
        },
        data: {
            motd: motd,
        },
    });
}

export async function topGuilds(limit = 5) {
    const guilds = await prisma.economyGuild.findMany({
        where: {
            balance: { gt: 1000 },
        },
        select: {
            guildName: true,
            balance: true,
            xp: true,
            level: true,
        },
    });

    inPlaceSort(guilds).desc([(i) => i.level, (i) => i.balance, (i) => i.xp]);

    const out: string[] = [];

    for (const guild of guilds) {
        if (out.length >= limit) break;
        let position: number | string = guilds.indexOf(guild) + 1;

        if (position == 1) position = "🥇";
        if (position == 2) position = "🥈";
        if (position == 3) position = "🥉";

        out.push(`${position} **${guild.guildName}**[${guild.level}] $${guild.balance.toLocaleString()}`);
    }

    return out;
}

export async function startOpeningCrates(member: GuildMember) {
    await redis.set(`economy:crates:block:${member.user.id}`, "y");
}

export async function stopOpeningCrates(member: GuildMember) {
    await redis.del(`economy:crates:block:${member.user.id}`);
}

export async function isHandcuffed(id: string): Promise<boolean> {
    return (await redis.exists(`economy:handcuffed:${id}`)) == 1 ? true : false;
}

export async function addHandcuffs(id: string) {
    await redis.set(`economy:handcuffed:${id}`, Date.now());
    await redis.expire(`economy:handcuffed:${id}`, 60);
}

export async function getBoosters(member: GuildMember | string): Promise<Map<string, Booster[]>> {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const cache = await redis.get(`cache:economy:boosters:${id}`);

    if (cache) {
        if (_.isEmpty(JSON.parse(cache))) return new Map();

        const map = new Map<string, Booster[]>(Object.entries(JSON.parse(cache)));

        for (const key of map.keys()) {
            const boosters = map.get(key);

            for (const booster of boosters) {
                if (booster.expire <= Date.now()) {
                    await prisma.booster.delete({
                        where: {
                            id: booster.id,
                        },
                    });

                    await redis.del(`cache:economy:boosters:${id}`);

                    boosters.splice(boosters.indexOf(booster), 1);
                    map.set(key, boosters);
                }
            }
        }

        return map;
    }

    const query = await prisma.booster.findMany({
        where: {
            userId: id,
        },
        select: {
            boosterId: true,
            expire: true,
            id: true,
        },
    });

    const map = new Map<string, Booster[]>();

    for (const booster of query) {
        if (booster.expire.getTime() <= Date.now()) {
            await prisma.booster.delete({
                where: {
                    id: booster.id,
                },
            });

            continue;
        }

        if (map.has(booster.boosterId)) {
            const c = map.get(booster.boosterId);

            c.push({
                boosterId: booster.boosterId,
                expire: booster.expire.getTime(),
                id: booster.id,
            });

            map.set(booster.boosterId, c);
        } else {
            map.set(booster.boosterId, [
                {
                    boosterId: booster.boosterId,
                    expire: booster.expire.getTime(),
                    id: booster.id,
                },
            ]);
        }
    }

    await redis.set(`cache:economy:boosters:${id}`, JSON.stringify(Object.fromEntries(map)));
    await redis.expire(`cache:economy:boosters:${id}`, 300);

    return map;
}

export async function addBooster(member: GuildMember | string, boosterId: string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await prisma.booster.create({
        data: {
            boosterId: boosterId,
            expire: new Date(Date.now() + items[boosterId].boosterEffect.time * 1000),
            userId: id,
        },
    });

    await redis.del(`cache:economy:boosters:${id}`);
}

export async function getLastDaily(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const query = await prisma.economy.findUnique({
        where: {
            userId: id,
        },
        select: {
            lastDaily: true,
        },
    });

    return query.lastDaily;
}

export async function updateLastDaily(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    await prisma.economy.update({
        where: {
            userId: id,
        },
        data: {
            lastDaily: new Date(),
            dailyStreak: { increment: 1 },
        },
    });
}

export async function getDailyStreak(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const query = await prisma.economy.findUnique({
        where: {
            userId: id,
        },
        select: {
            dailyStreak: true,
        },
    });

    return query.dailyStreak;
}

export async function getAuctions(member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.user.id;
    } else {
        id = member;
    }

    const query = await prisma.auction.findMany({
        where: {
            ownerId: id,
        },
    });

    return query;
}

export async function getAuctionByMessage(id: string) {
    const auction = await prisma.auction.findUnique({
        where: {
            messageId: id,
        },
    });

    return auction;
}

export async function deleteAuction(id: string, client: NypsiClient) {
    const auction = await prisma.auction
        .delete({
            where: {
                id: id,
            },
            select: {
                messageId: true,
            },
        })
        .catch();

    if (auction) {
        await client.cluster.broadcastEval(
            async (client, { id }) => {
                const guild = await client.guilds.fetch("747056029795221513");

                if (!guild) return;

                const channel = await guild.channels.fetch("1008467335973179482");

                if (!channel) return;

                if (channel.isTextBased()) {
                    const msg = await channel.messages.fetch(id).catch();

                    if (msg) await msg.delete().catch();
                }
            },
            { context: { id: auction.messageId } }
        );
    }

    return Boolean(auction);
}

export async function createAuction(member: GuildMember, itemId: string, itemAmount: number, bin: number) {
    const embed = new CustomEmbed(member).setHeader(`${member.user.username}'s auction`, member.user.avatarURL());

    embed.setDescription(
        `started <t:${Math.floor(Date.now() / 1000)}:R>\n\n` +
            `**${itemAmount.toLocaleString()}x** ${items[itemId].emoji} ${
                items[itemId].name
            } for $**${bin.toLocaleString()}**`
    );

    const button = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("b").setLabel("buy").setStyle(ButtonStyle.Success)
    );

    const clusters = await (member.client as NypsiClient).cluster.broadcastEval(async (client) => {
        const guild = await client.guilds.fetch("747056029795221513");

        if (guild) return (client as NypsiClient).cluster.id;
        return "not-found";
    });

    let cluster: number;

    for (const i of clusters) {
        if (i != "not-found") {
            cluster = i;
            break;
        }
    }

    const { messageId, messageUrl } = await (member.client as NypsiClient).cluster
        .broadcastEval(
            async (client, { embed, row, cluster }) => {
                if ((client as NypsiClient).cluster.id != cluster) return;
                const guild = await client.guilds.fetch("747056029795221513");

                if (!guild) return;

                const channel = await guild.channels.fetch("1008467335973179482");

                if (!channel) return;

                if (channel.isTextBased()) {
                    const msg = await channel.send({ embeds: [embed], components: [row] });

                    return { messageId: msg.id, messageUrl: msg.url };
                }
            },
            { context: { embed: embed.toJSON(), row: button.toJSON(), cluster: cluster } }
        )
        .then((res) => {
            res.filter((i) => Boolean(i));
            return res[0];
        });

    await prisma.auction.create({
        data: {
            bin: bin,
            itemName: itemId,
            messageId: messageId,
            itemAmount: itemAmount,
            ownerId: member.user.id,
        },
    });

    return messageUrl;
}

export async function bumpAuction(id: string, client: NypsiClient) {
    const query = await prisma.auction.findUnique({
        where: {
            id: id,
        },
        select: {
            messageId: true,
            owner: {
                select: {
                    lastKnownTag: true,
                },
            },
            createdAt: true,
            bin: true,
            itemAmount: true,
            itemName: true,
        },
    });

    const embed = new CustomEmbed().setColor("#36393f").setHeader(`${query.owner.lastKnownTag.split("#")[0]}'s auction`);

    embed.setDescription(
        `started <t:${Math.floor(query.createdAt.getTime() / 1000)}:R>\n\n` +
            `**${query.itemAmount.toLocaleString()}x** ${items[query.itemName].emoji} ${
                items[query.itemName].name
            } for $**${query.bin.toLocaleString()}**`
    );

    const button = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("b").setLabel("buy").setStyle(ButtonStyle.Success)
    );

    const messageUrl = await client.cluster
        .broadcastEval(
            async (client, { row, messageId, embed }) => {
                const guild = await client.guilds.fetch("747056029795221513");

                if (!guild) return;

                const channel = await guild.channels.fetch("1008467335973179482");

                if (!channel) return;

                if (channel.isTextBased()) {
                    const msg = await channel.messages.fetch(messageId).catch();

                    if (msg) {
                        await msg.delete();
                    }

                    const m = await channel.send({ embeds: [embed], components: [row] });

                    return m.url;
                }
            },
            { context: { messageId: query.messageId, row: button.toJSON(), embed: embed.toJSON() } }
        )
        .then((res) => {
            res.filter((i) => Boolean(i));
            return res[0];
        });

    return messageUrl;
}
