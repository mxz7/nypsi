import { variants } from "@catppuccin/palette";
import { Client, ColorResolvable, User, WebhookClient } from "discord.js";
import { randomInt } from "node:crypto";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { LotteryTicket } from "../../types/Economy";
import { MStoTime } from "../../utils/functions/date";
import { addProgress } from "../../utils/functions/economy/achievements";
import { getBalance, updateBalance } from "../../utils/functions/economy/balance";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { getItems, lotteryTicketPrice } from "../../utils/functions/economy/utils";
import { percentChance, shuffle } from "../../utils/functions/random";
import { addToNypsiBank, getTax } from "../../utils/functions/tax";
import { addNotificationToQueue, getDmSettings } from "../../utils/functions/users/notifications";
import { logger } from "../../utils/logger";
import dayjs = require("dayjs");
import ms = require("ms");
import Constants from "../../utils/Constants";

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
    embed.setColor(variants.latte.base.hex as ColorResolvable);
    embed.disableFooter();

    return hook.send({ embeds: [embed] });
  }

  const taxedAmount = Math.floor(tickets.length * lotteryTicketPrice * (await getTax()));

  const total = Math.floor(tickets.length * lotteryTicketPrice - taxedAmount);

  const shuffledTickets = shuffle(tickets);

  let chosen: LotteryTicket;
  let user: User;

  while (!user) {
    chosen = shuffledTickets[randomInt(shuffledTickets.length)];

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
  embed.setColor(variants.latte.base.hex as ColorResolvable);

  await hook.send({ embeds: [embed] });

  if ((await getDmSettings(user.id)).lottery) {
    embed.setTitle("you have won the lottery!");
    embed.setDescription(`you have won a total of $**${total.toLocaleString()}**\n\nyour winning ticket was #${chosen.id}`);
    embed.setColor(variants.latte.base.hex as ColorResolvable);

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

    if (percentChance(0.9)) {
      await addInventoryItem(user.id, "purple_gem", 1);
      addProgress(user.id, "gem_hunter", 1);

      if ((await getDmSettings(user.id)).other) {
        await addNotificationToQueue({
          memberId: user.id,
          payload: {
            embed: new CustomEmbed()
              .setDescription(`${getItems()["purple_gem"].emoji} you've found a gem! i wonder what powers it holds...`)
              .setTitle("you've found a gem")
              .setColor(Constants.TRANSPARENT_EMBED_COLOR),
          },
        });
      }
    }
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
