import ms = require("ms");
import prisma from "../database/database";
import redis from "../database/redis";

export async function getTax() {
    let tax: number;

    if (!(await redis.exists("nypsi:tax"))) {
        tax = await updateTax();
    } else {
        tax = parseFloat(await redis.get("nypsi:tax"));
    }

    return parseFloat(tax.toFixed(3));
}

export async function getTaxRefreshTime() {
    return Math.floor(Date.now() / 1000 + (await redis.ttl("nypsi:tax")));
}

async function updateTax() {
    const tax = parseFloat((Math.random() * 5 + 5).toFixed(3)) / 100;

    await redis.set("nypsi:tax", tax.toFixed(3));
    await redis.expire("nypsi:tax", Math.floor(ms("12 hours") / 1000));

    return tax;
}

export async function addToNypsiBank(amount: number) {
    await prisma.economy.upsert({
        where: {
            userId: "678711738845102087",
        },
        update: {
            bank: { increment: Math.floor(amount) },
        },
        create: {
            bank: amount,
            lastVote: new Date(0),
            userId: "678711738845102087",
        },
    });
}

export async function getNypsiBankBalance() {
    const query = await prisma.economy.findUnique({
        where: {
            userId: "678711738845102087",
        },
        select: {
            bank: true,
        },
    });

    return Number(query?.bank) || 0;
}

export async function removeFromNypsiBankBalance(amount: number) {
    await prisma.economy.update({
        where: {
            userId: "678711738845102087",
        },
        data: {
            bank: { decrement: Math.floor(amount) },
        },
    });
}
