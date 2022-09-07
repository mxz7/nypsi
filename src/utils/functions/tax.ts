import ms = require("ms");
import prisma from "../database/database";
import redis from "../database/redis";

export async function getTax() {
    if (!(await redis.exists("nypsi:tax"))) {
        return await updateTax();
    } else {
        return parseFloat((parseFloat(await redis.get("nypsi:tax")) / 100).toFixed(1));
    }
}

async function updateTax() {
    const tax = parseFloat((Math.random() * 5 + 5).toFixed(1));

    await redis.set("nypsi:tax", tax);
    await redis.expire("nypsi:tax", ms("16 hours"));

    return tax;
}

export async function addToNypsiBank(amount: number) {
    await prisma.economy.upsert({
        where: {
            userId: "678711738845102087",
        },
        update: {
            bank: { increment: amount },
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

    return query?.bank || 0;
}

export async function removeFromNypsiBankBalance(amount: number) {
    await prisma.economy.update({
        where: {
            userId: "678711738845102087",
        },
        data: {
            bank: { decrement: amount },
        },
    });
}
