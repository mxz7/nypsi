import { Client, User, WebhookClient } from "discord.js";
import prisma from "../../database/database";
import { getBalance, getDMsEnabled, lotteryTicketPrice, updateBalance } from "../../economy/utils";
import { MStoTime } from "../../functions/date";
import { logger } from "../../logger";
import { LotteryTicket } from "../../models/Economy";
import { CustomEmbed } from "../../models/EmbedBuilders";
import shuffleArray = require("shuffle-array");

async function doLottery(client: Client) {
    logger.info("performing lottery..");

    const hook = new WebhookClient({ url: process.env.LOTTERY_HOOK });

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

        return hook.send({ embeds: [embed] });
    }

    const total = Math.floor(tickets.length * lotteryTicketPrice * 0.9);

    const shuffledTickets = shuffleArray(tickets);

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

    await hook.send({ embeds: [embed] });

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

    await prisma.$executeRaw`ALTER SEQUENCE "LotteryTicket_id_seq" RESTART WITH 1;`;

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
