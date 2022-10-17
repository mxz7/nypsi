import { Client, User, WebhookClient } from "discord.js";
import prisma from "../../init/database";
import redis from "../../utils/database/redis";
import { MStoTime } from "../../utils/functions/date";
import { addProgress } from "../../utils/functions/economy/achievements";
import { getBalance, updateBalance } from "../../utils/functions/economy/balance";
import { lotteryTicketPrice } from "../../utils/functions/economy/utils";
import { addToNypsiBank, getTax } from "../../utils/functions/tax";
import { getDmSettings } from "../../utils/functions/users/notifications";
import { logger } from "../../utils/logger";
import { LotteryTicket } from "../../utils/models/Economy";
import { CustomEmbed } from "../../utils/models/EmbedBuilders";
import shuffleArray = require("shuffle-array");
import dayjs = require("dayjs");
import ms = require("ms");

async function doLottery(client: Client) {
  await redis.del("lotterytickets:queue");
  logger.info("performing lottery..");

  const hook = new WebhookClient({ url: process.env.LOTTERY_HOOK });

  const tickets = await prisma.lotteryTicket.findMany();

  if (tickets.length < 100) {
    logger.info(`${tickets.length} tickets were bought ): maybe next week you'll have something to live for`);

    const embed = new CustomEmbed();

    embed.setTitle("lottery cancelled");
    embed.setDescription(
      `the lottery has been cancelled as only **${tickets.length}** tickets were bought ):\n\nthese tickets will remain and the lottery will happen next week`
    );
    embed.setColor("#111111");
    embed.disableFooter();

    return hook.send({ embeds: [embed] });
  }

  const taxedAmount = Math.floor(tickets.length * lotteryTicketPrice * (await getTax()));

  const total = Math.floor(tickets.length * lotteryTicketPrice - taxedAmount);

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

  await Promise.all([
    updateBalance(user.id, (await getBalance(user.id)) + total),
    addProgress(user.id, "lucky", 1),
    addToNypsiBank(taxedAmount),
  ]);

  const embed = new CustomEmbed();

  embed.setTitle("lottery winner");
  embed.setDescription(
    `**${user.username}** has won the lottery with ticket #${chosen.id}!!\n\n` +
      `they have won $**${total.toLocaleString()}**`
  );
  embed.setFooter({ text: `a total of ${tickets.length.toLocaleString()} tickets were bought` });
  embed.setColor("#111111");

  await hook.send({ embeds: [embed] });

  if ((await getDmSettings(user.id)).lottery) {
    embed.setTitle("you have won the lottery!");
    embed.setDescription(`you have won a total of $**${total.toLocaleString()}**\n\nyour winning ticket was #${chosen.id}`);
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
  const next = dayjs().add(1, "day").startOf("day").toDate();

  const needed = next.getTime() - Date.now();

  setTimeout(() => {
    doLottery(client);
    setInterval(() => {
      doLottery(client);
    }, ms("1 day"));
  }, needed);

  logger.log({
    level: "auto",
    message: `lottery will run in ${MStoTime(needed)}`,
  });
}
