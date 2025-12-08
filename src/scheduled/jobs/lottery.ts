import { flavors } from "@catppuccin/palette";
import { randomInt } from "crypto";
import { ColorResolvable, WebhookClient } from "discord.js";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";
import { addProgress } from "../../utils/functions/economy/achievements";
import { addBalance, getBalance, removeBalance } from "../../utils/functions/economy/balance";
import { addInventoryItem, setInventoryItem } from "../../utils/functions/economy/inventory";
import { addStat } from "../../utils/functions/economy/stats";
import { getItems } from "../../utils/functions/economy/utils";
import { percentChance } from "../../utils/functions/random";
import { getTax } from "../../utils/functions/tax";
import { addNotificationToQueue, getDmSettings } from "../../utils/functions/users/notifications";
import { getLastKnownAvatar, getLastKnownUsername } from "../../utils/functions/users/username";
import { logger } from "../../utils/logger";
import pAll = require("p-all");

export default {
  name: "lottery",
  cron: "0 0 * * *",
  async run(log) {
    await redis.set("nypsi:lottery", "boobies", "EX", 3600);
    const hook = new WebhookClient({ url: process.env.LOTTERY_HOOK });

    const tickets = await prisma.inventory.findMany({
      where: { item: "lottery_ticket" },
      select: { userId: true, amount: true },
    });
    const total = Number(tickets.map((i) => i.amount).reduce((a, b) => a + b, 0n));

    if (total < 100) {
      log(`${total} tickets were bought ): maybe tomorrow you'll have something to live for`);

      const embed = new CustomEmbed();

      embed.setTitle("lottery cancelled");
      embed.setDescription(
        `the lottery has been cancelled as only **${total}** tickets were bought ):\n\nthese tickets will remain and the lottery will happen tomorrow`,
      );
      embed.setColor(flavors.latte.colors.base.hex as ColorResolvable);
      embed.disableFooter();

      await hook.send({ embeds: [embed] });
      hook.destroy();
    } else {
      const taxedAmount =
        Math.floor(total * getItems()["lottery_ticket"].buy * (await getTax())) * 1.5;

      const totalPrize = Math.floor(total * getItems()["lottery_ticket"].buy - taxedAmount);

      const before = performance.now();
      const winner = await findWinner(tickets);
      const after = performance.now();

      log(`winner found in ${after - before}ms`);

      if (!winner) {
        log("ERROR RUNNING LOTTERY");
        await redis.del("nypsi:lottery");
        return;
      }

      const winnerUsername = await getLastKnownUsername(winner.userId, false);
      const winnerAvatar = await getLastKnownAvatar(winner.userId);

      deleteAllTickets(tickets);

      log(`winner: ${winner.userId} (${winnerUsername})`);

      await Promise.all([
        addBalance(winner.userId, totalPrize),
        addProgress(winner.userId, "lucky", 1),
        addStat(winner.userId, "earned-lottery", totalPrize),
      ]);

      const embed = new CustomEmbed();

      embed.setHeader("lottery winner", winnerAvatar);
      embed.setDescription(
        `**${winnerUsername.replaceAll("_", "\\_")}** has won the lottery with ${winner.amount.toLocaleString()} tickets!!\n\n` +
          `they have won $**${totalPrize.toLocaleString()}**`,
      );
      embed.setFooter({ text: `a total of ${total.toLocaleString()} tickets were bought` });
      embed.setColor(flavors.latte.colors.base.hex as ColorResolvable);

      await hook.send({ embeds: [embed] });

      hook.destroy();

      if ((await getDmSettings(winner.userId)).lottery) {
        embed.setTitle("you have won the lottery!");
        embed.setDescription(
          `you have won a total of $**${totalPrize.toLocaleString()}**\n\nyou had ${winner.amount.toLocaleString()} tickets`,
        );
        embed.setColor(flavors.latte.colors.base.hex as ColorResolvable);

        addNotificationToQueue({ memberId: winner.userId, payload: { embed } });

        if (percentChance(0.9) && !(await redis.exists(Constants.redis.nypsi.GEM_GIVEN))) {
          await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t", "EX", 86400);
          logger.info(`${winner.userId} received purple_gem randomly (mines)`);
          await addInventoryItem(winner.userId, "purple_gem", 1);
          addProgress(winner.userId, "gem_hunter", 1);

          if ((await getDmSettings(winner.userId)).other) {
            addNotificationToQueue({
              memberId: winner.userId,
              payload: {
                embed: new CustomEmbed(winner.userId)
                  .setDescription(
                    `${
                      getItems()["purple_gem"].emoji
                    } you've found a gem! i wonder what powers it holds...`,
                  )
                  .setTitle("you've found a gem"),
              },
            });
          }
        }
      }
    }

    await redis.del("nypsi:lottery");

    const autoBuys = await prisma.economy.findMany({
      where: {
        dailyLottery: { gt: 0 },
      },
      select: {
        userId: true,
        dailyLottery: true,
        user: {
          select: {
            DMSettings: {
              select: {
                other: true,
              },
            },
          },
        },
      },
    });

    for (const user of autoBuys) {
      const balance = await getBalance(user.userId);

      if (balance >= getItems()["lottery_ticket"].buy * user.dailyLottery) {
        log(`auto buying ${user.dailyLottery} lottery tickets for ${user.userId}`);
        await removeBalance(user.userId, getItems()["lottery_ticket"].buy * user.dailyLottery);
        addStat(user.userId, "spent-shop", getItems()["lottery_ticket"].buy * user.dailyLottery);
        await addInventoryItem(user.userId, "lottery_ticket", user.dailyLottery);

        if (user.user.DMSettings.other) {
          await addNotificationToQueue({
            memberId: user.userId,
            payload: {
              embed: new CustomEmbed(
                user.userId,
                `you have auto bought **${user.dailyLottery}** lottery tickets`,
              ),
            },
          });
        }
      }
    }
  },
} satisfies Job;

async function findWinner(tickets: { userId: string; amount: bigint }[]) {
  const ticketCount = tickets.map((i) => i.amount).reduce((a, b) => a + b);

  let r = BigInt(randomInt(Number(ticketCount) + 1));

  for (const ticketUser of tickets) {
    r -= ticketUser.amount;
    if (r <= 0n) {
      return { userId: ticketUser.userId, amount: Number(ticketUser.amount) };
    }
  }

  // this should never happen
  return { userId: Constants.BOT_USER_ID, tickets: -1 };
}

async function deleteAllTickets(tickets: { userId: string }[]) {
  const promises: (() => Promise<void>)[] = [];

  for (const ticket of tickets) {
    promises.push(() => setInventoryItem(ticket.userId, "lottery_ticket", 0));
  }

  await pAll(promises, { concurrency: 5 });
}
