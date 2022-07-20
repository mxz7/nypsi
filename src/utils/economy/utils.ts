import { logger } from "../logger";
import * as topgg from "@top-gg/sdk";
import { Item, LotteryTicket } from "../models/Economy";
import { Client, Collection, Guild, GuildMember, User, WebhookClient } from "discord.js";
import { CustomEmbed } from "../models/EmbedBuilders";
import * as fs from "fs";
import { getTier, isPremium } from "../premium/utils";
import { inPlaceSort } from "fast-sort";
import { Constructor, getAllWorkers, Worker, WorkerStorageData } from "./workers";
import { StatsProfile } from "../models/StatsProfile";
import * as shufflearray from "shuffle-array";
import fetch from "node-fetch";
import workerSort from "../workers/sort";
import { MStoTime } from "../functions/date";
import ms = require("ms");
import redis from "../database/redis";
import prisma from "../database/database";
import { createProfile, hasProfile } from "../users/utils";

declare function require(name: string): any;

const topggStats = new topgg.Api(process.env.TOPGG_TOKEN);

const bannedCache = new Map();
const guildExistsCache = new Map();
const guildUserCache = new Map();
const guildRequirementsCache = new Map();

let items: { [key: string]: Item };

const lotteryTicketPrice = 15000;
/**
 * higher ticket price = more favourable to rich people cus poor people cant buy tickets resulting in less tickets overall
 * the goal is to have more tickets overall for a more random outcome
 */
export { lotteryTicketPrice };

let lotteryHook: WebhookClient;

if (!process.env.GITHUB_ACTION) {
    lotteryHook = new WebhookClient({ url: process.env.LOTTERY_HOOK });
}

const lotteryHookQueue = new Map();

setInterval(() => {
    if (lotteryHookQueue.size == 0) return;

    const desc = [];

    for (const username of lotteryHookQueue.keys()) {
        const amount = lotteryHookQueue.get(username);

        desc.push(`**${username}** has bought **${amount}** lottery ticket${amount > 1 ? "s" : ""}`);

        lotteryHookQueue.delete(username);

        if (desc.join("\n").length >= 1500) break;
    }

    const embed = new CustomEmbed();

    embed.setColor("#111111");
    embed.setDescription(desc.join("\n"));
    embed.setTimestamp();
    embed.disableFooter();

    lotteryHook.send({ embeds: [embed] });
}, ms("30 minutes"));

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

loadItems();

function randomOffset() {
    return Math.floor(Math.random() * 50000);
}

let padlockPrice = 25000 + randomOffset();
items["padlock"].worth = padlockPrice;
logger.info("padlock price updated: $" + padlockPrice.toLocaleString());

setInterval(() => {
    padlockPrice = 25000 + randomOffset();
    items["padlock"].worth = padlockPrice;
    logger.info("padlock price updated: $" + padlockPrice.toLocaleString());
}, 3600000);

async function updateCryptoWorth() {
    let res = await fetch("https://api.coindesk.com/v1/bpi/currentprice/USD.json").then((res) => res.json());

    const btcworth = Math.floor(res.bpi.USD.rate_float);

    items["bitcoin"].worth = btcworth;
    logger.info("bitcoin worth updated: $" + items["bitcoin"].worth.toLocaleString());

    res = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=ETH").then((res) => res.json());

    const ethWorth = Math.floor(res.data.rates.USD);

    if (!ethWorth) {
        logger.error("INVALID ETH WORTH");
        return logger.error(res);
    }

    items["ethereum"].worth = ethWorth;
    logger.info("ethereum worth updated: $" + items["ethereum"].worth.toLocaleString());
}

setInterval(updateCryptoWorth, 1500000);

export function getPadlockPrice(): number {
    return padlockPrice;
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

    return query.bank;
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

export async function getXp(member: GuildMember): Promise<number> {
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

export async function getMaxBankBalance(member: GuildMember): Promise<number> {
    const xp = await getXp(member);
    const constant = 550;
    const starting = 15000;
    const bonus = xp * constant;
    const max = bonus + starting;

    return max;
}

export async function topAmountGlobal(amount: number, client?: Client, anon = true): Promise<string[]> {
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
    });

    const userIDs: string[] = [];
    const balances: Map<string, number> = new Map();
    const usernames: Map<string, string> = new Map();

    for (const user of query) {
        userIDs.push(user.userId);
        balances.set(user.userId, Number(user.money));
        usernames.set(user.userId, user.user.lastKnownTag);
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

            let username = usernames.get(user);

            if (client) {
                const member = await client.users.fetch(user);

                if (member) {
                    username = member.tag;
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
    });

    let userIDs = [];
    const balances = new Map();

    for (const user of query) {
        if (members.has(user.userId)) {
            userIDs.push(user.userId);
            balances.set(user.userId, user.money);
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
    });

    let userIDs = [];
    const balances = new Map();

    for (const user of query) {
        if (members.find((member) => member.user.id == user.userId)) {
            userIDs.push(user.userId);
            balances.set(user.userId, user.money);
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
    });

    let userIDs = [];
    const prestiges = new Map();

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

export function formatNumber(number: string): number | void {
    number = number.toString().toLowerCase().replace("t", "000000000000");
    number = number.replace("b", "000000000");
    number = number.replace("m", "000000");
    number = number.replace("k", "000");

    if (isNaN(parseInt(number))) return null;

    return Math.floor(parseInt(number));
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

export function updateStats(guildCount: number, shardCount: number) {
    topggStats.postStats({
        serverCount: guildCount,
        shardCount: shardCount,
    });

    // fetch("https://discord.bots.gg/bots/678711738845102087/stats", {
    //     method: "POST",
    //     body: JSON.stringify({ shardCount: shardCount, guildCount: guildCount }),
    //     headers: { "Content-Type": "application/json", "Authorization": "removed token" }
    // }) FOR POSTING TO DISCORD.BOTS.GG
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
    const constant = 250;
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
    if (bannedCache.has(id)) {
        return bannedCache.get(id);
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
            bannedCache.set(id, false);
            return false;
        }

        if (query.banned) {
            bannedCache.set(id, true);
            return true;
        } else {
            bannedCache.set(id, false);
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

    bannedCache.delete(id);
}

export async function reset() {
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
        const prestige = user.prestige;
        const lastVote = user.lastVote;
        const dms = user.dms;

        await prisma.economy.update({
            where: {
                userId: user.userId,
            },
            data: {
                money: 500,
                bank: 9500,
                xp: 0,
                prestige: prestige,
                padlock: false,
                dms: dms,
                lastVote: lastVote,
                inventory: {},
                workers: {},
            },
        });

        updated++;
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

    const query = await prisma.economy.findUnique({
        where: {
            userId: id,
        },
        select: {
            inventory: true,
        },
    });

    if (!query.inventory) {
        return {};
    }

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

    await prisma.economy.delete({
        where: {
            userId: id,
        },
    });
    await redis.del(`cache:economy:exists:${id}`);
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

    if (lotteryHookQueue.has(member.user.username)) {
        lotteryHookQueue.set(member.user.username, lotteryHookQueue.get(member.user.username) + 1);
    } else {
        lotteryHookQueue.set(member.user.username, 1);
    }
}

async function doLottery(client: Client) {
    logger.info("performing lottery..");
    const tickets = await prisma.lotteryTicket.findMany();

    if (tickets.length < 100) {
        logger.info(`${tickets.length} tickets were bought ): maybe next week you'll have something to live for`);

        const embed = new CustomEmbed();

        embed.setTitle("lottery cancelled");
        embed.setDescription(
            `the lottery has been cancelled as only **${tickets.length}** were bought ):\n\nthese tickets will remain and the lottery will happen next week`
        );
        embed.setColor("#111111");
        embed.disableFooter();

        return lotteryHook.send({ embeds: [embed] });
    }

    const total = Math.floor(tickets.length * lotteryTicketPrice * 0.9);

    const shuffledTickets = shufflearray(tickets);

    let chosen: LotteryTicket;
    let user: User;

    while (!user) {
        chosen = shuffledTickets[Math.floor(Math.random() * shuffledTickets.length)];

        logger.info(`winner: ${chosen.userId} with ticket #${chosen.id}`);

        user = await client.users.fetch(chosen.userId);
    }

    logger.log({
        level: "success",
        message: `winner: ${user.tag} (${user.id}) with ticket #${chosen.id}`,
    });

    await updateBalance(user.id, (await getBalance(user.id)) + total);

    const embed = new CustomEmbed();

    embed.setTitle("lottery winner");
    embed.setDescription(
        `**${user.username}** has won the lottery with ticket #${chosen.id}!!\n\n` +
            `they have won a total of $**${total.toLocaleString()}**`
    );
    embed.setFooter({ text: `a total of ${tickets.length.toLocaleString()} tickets were bought` });
    embed.setColor("#111111");
    embed.disableFooter();

    await lotteryHook.send({ embeds: [embed] });

    if (await getDMsEnabled(user.id)) {
        embed.setTitle("you have won the lottery!");
        embed.setDescription(
            `you have won a total of $**${total.toLocaleString()}**\n\nyour winning ticket was #${chosen.id}`
        );
        embed.setColor("#111111");

        await user
            .send({ embeds: [embed] })
            .then(() => {
                logger.log({
                    level: "success",
                    message: "sent notification to winner",
                });
            })
            .catch(() => {
                logger.warn("failed to send notification to winner");
            });
    }

    const { count } = await prisma.lotteryTicket.deleteMany();

    logger.info(`${count.toLocaleString()} tickets deleted from database`);
}

export function runLotteryInterval(client: Client) {
    const now = new Date();
    const saturday = new Date();
    saturday.setDate(now.getDate() + ((6 - 1 - now.getDay() + 7) % 7) + 1);
    saturday.setHours(0, 0, 0, 0);

    const needed = saturday.getTime() - now.getTime();

    setTimeout(() => {
        doLottery(client);
        setInterval(() => {
            doLottery(client);
        }, 86400 * 1000 * 7);
    }, needed);

    logger.log({
        level: "auto",
        message: `lottery will run in ${MStoTime(needed)}`,
    });
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
                    crateItemsModified.push(i);
                    crateItemsModified.push(i);
                } else if (items[i].rarity == 0) {
                    crateItemsModified.push(i);
                    crateItemsModified.push(i);
                    crateItemsModified.push(i);
                }
            } else {
                crateItemsModified.push(i);
                crateItemsModified.push(i);
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
    earned += await getPrestige(member);

    let max = 6;

    const guild = await getGuildByUser(member);

    if (guild) {
        max += guild.level - 1;
    }

    if (earned > max) earned = max;

    return earned;
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

    return earned;
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

    if (guildUserCache.has(id)) {
        guildName = guildUserCache.get(id);

        if (!guildName) return undefined;
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
            guildUserCache.set(id, undefined);
            return undefined;
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

    if (guildUserCache.has(owner.user.id)) {
        guildUserCache.delete(owner.user.id);
    }
}

export async function deleteGuild(name: string) {
    guildUserCache.clear();

    guildExistsCache.delete(name);

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

export async function addToGuildBank(name: string, amount: number, member: GuildMember) {
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

    return checkUpgrade(name);
}

export async function addToGuildXP(name: string, amount: number, member: GuildMember) {
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

    return checkUpgrade(name);
}

export async function getMaxMembersForGuild(name: string) {
    const guild = await getGuildByName(name);

    return guild.level * 3;
}

export async function getRequiredForGuildUpgrade(name: string): Promise<{ money: number; xp: number }> {
    if (guildRequirementsCache.has(name)) {
        return guildRequirementsCache.get(name);
    }

    const guild = await getGuildByName(name);

    const baseMoney = 1900000 * Math.pow(guild.level, 2);
    const baseXP = 1425 * Math.pow(guild.level, 2);

    const bonusMoney = 100000 * guild.members.length;
    const bonusXP = 75 * guild.members.length;

    guildRequirementsCache.set(name, {
        money: baseMoney + bonusMoney,
        xp: baseXP + bonusXP,
    });

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

    if (guildUserCache.has(member.user.id)) {
        guildUserCache.delete(member.user.id);
    }

    return true;
}

export enum RemoveMemberMode {
    ID,
    TAG,
}

export async function removeMember(member: string, mode: RemoveMemberMode) {
    guildUserCache.clear();

    if (mode == RemoveMemberMode.ID) {
        await prisma.economyGuildMember.delete({
            where: {
                userId: member,
            },
        });
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

        if (x) return true;
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

async function checkUpgrade(guild: EconomyGuild | string): Promise<boolean> {
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

        guildRequirementsCache.clear();

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
                const { requestDM } = require("../../nypsi");

                await requestDM(member.userId, `${guild.guildName} has been upgraded!`, false, embed);
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
