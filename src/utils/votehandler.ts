import * as topgg from "@top-gg/sdk";
import { Manager } from "discord-hybrid-sharding";
import * as express from "express";
import prisma from "./database/database";
import redis from "./database/redis";
import {
    getBalance,
    getDMsEnabled,
    getInventory,
    getPrestige,
    getTickets,
    setInventory,
    updateBalance,
    userExists,
} from "./economy/utils";
import requestDM from "./functions/requestdm";
import { addKarma, getKarma } from "./karma/utils";
import { logger } from "./logger";
import { CustomEmbed } from "./models/EmbedBuilders";
import { getTier, isPremium } from "./premium/utils";
import ms = require("ms");
import dayjs = require("dayjs");

const app = express();
const webhook = new topgg.Webhook("123");

export function listenForVotes(manager: Manager) {
    app.post(
        "/dblwebhook",
        webhook.listener((vote) => {
            logger.info(`received vote: ${vote.user}`);
            doVote(vote, manager);
        })
    );

    app.listen(5000);

    logger.info("listening for votes..");
}

async function doVote(vote: topgg.WebhookPayload, manager: Manager) {
    const { user } = vote;

    if (!(await userExists(user))) {
        logger.warn(`${user} doesnt exist`);
        return;
    }

    const now = new Date().getTime();

    const query = await prisma.economy.findUnique({
        where: {
            userId: user,
        },
        select: {
            lastVote: true,
        },
    });

    const lastVote = query.lastVote.getTime();

    if (now - lastVote < 25200000) {
        return logger.error(`${user} already voted`);
    }

    await prisma.economy.update({
        where: {
            userId: user,
        },
        data: {
            lastVote: new Date(now),
        },
    });

    redis.set(`cache:vote:${user}`, "true");
    redis.expire(`cache:vote:${user}`, ms("1 hour") / 1000);

    let prestige = await getPrestige(user);

    if (prestige > 15) prestige = 15;

    const amount = Math.floor(15000 * (prestige / 2 + 1));
    const inventory = await getInventory(user);

    await Promise.all([
        updateBalance(user, (await getBalance(user)) + amount),
        addKarma(user, 10),
        prisma.booster.create({
            data: {
                boosterId: "vote_booster",
                userId: user,
                expire: dayjs().add(1, "hour").toDate(),
            },
        }),
        redis.del(`cache:vote:${user}`),
    ]);

    const tickets = await getTickets(user);

    const prestigeBonus = Math.floor(((await getPrestige(user)) > 20 ? 20 : await getPrestige(user)) / 2.5);
    const premiumBonus = Math.floor((await isPremium(user)) ? await getTier(user) : 0);
    const karmaBonus = Math.floor((await getKarma(user)) / 100);

    let max = 15 + (prestigeBonus + premiumBonus + karmaBonus) * 4;

    if (max > 50) max = 50;

    let crateAmount = Math.floor(prestige / 2 + 1);

    if (crateAmount > 3) crateAmount = 3;

    if (inventory["vote_crate"]) {
        inventory["vote_crate"] += crateAmount;
    } else {
        inventory["vote_crate"] = crateAmount;
    }

    await setInventory(user, inventory);

    if (await getDMsEnabled(user)) {
        const embed = new CustomEmbed()
            .setColor("#5efb8f")
            .setDescription(
                "you have received the following: \n\n" +
                    `+ $**${amount.toLocaleString()}**\n` +
                    "+ **5**% multiplier\n" +
                    `+ **${crateAmount}** vote crates` +
                    `${tickets.length < max ? "\n+ **1** lottery ticket" : ""}`
            )
            .disableFooter();

        const res = await requestDM({
            memberId: user,
            client: manager,
            content: "thank you for voting!",
            embed: embed,
        });

        if (res) {
            logger.log({
                level: "success",
                message: `vote processed for ${user}`,
            });
        } else {
            logger.warn(`failed to send vote confirmation to ${user}`);
        }
    }
}
