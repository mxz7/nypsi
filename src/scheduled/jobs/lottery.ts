import { flavors } from "@catppuccin/palette";
import { exec } from "child_process";
import { ColorResolvable, WebhookClient } from "discord.js";
import { clone } from "lodash";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";
import { addProgress } from "../../utils/functions/economy/achievements";
import { addBalance, getBalance, removeBalance } from "../../utils/functions/economy/balance";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { getTicketCount } from "../../utils/functions/economy/lottery";
import { addStat } from "../../utils/functions/economy/stats";
import { getItems } from "../../utils/functions/economy/utils";
import { percentChance } from "../../utils/functions/random";
import sleep from "../../utils/functions/sleep";
import { getTax } from "../../utils/functions/tax";
import { addNotificationToQueue, getDmSettings } from "../../utils/functions/users/notifications";
import { getLastKnownAvatar, getLastKnownUsername } from "../../utils/functions/users/tag";
import { logger } from "../../utils/logger";

export default {
  name: "lottery",
  cron: "0 0 * * *",
  async run(log) {
    await redis.set("nypsi:lottery", "boobies", "EX", 3600);
    const hook = new WebhookClient({ url: process.env.LOTTERY_HOOK });

    const ticketCount = await getTicketCount();

    if (ticketCount < 100) {
      log(`${ticketCount} tickets were bought ): maybe tomorrow you'll have something to live for`);

      const embed = new CustomEmbed();

      embed.setTitle("lottery cancelled");
      embed.setDescription(
        `the lottery has been cancelled as only **${ticketCount}** tickets were bought ):\n\nthese tickets will remain and the lottery will happen tomorrow`,
      );
      embed.setColor(flavors.latte.colors.base.hex as ColorResolvable);
      embed.disableFooter();

      await hook.send({ embeds: [embed] });
      hook.destroy();
    } else {
      const taxedAmount =
        Math.floor(ticketCount * getItems()["lottery_ticket"].buy * (await getTax())) * 1.5;

      const total = Math.floor(ticketCount * getItems()["lottery_ticket"].buy - taxedAmount);

      const before = performance.now();
      const winner = await findWinner();
      const after = performance.now();

      log(`winner found in ${after - before}ms`);

      if (!winner) {
        log("ERROR RUNNING LOTTERY");
        await redis.del("nypsi:lottery");
        return;
      }

      const winnerUsername = await getLastKnownUsername(winner.winner);
      const winnerAvatar = await getLastKnownAvatar(winner.winner);
      prisma.inventory
        .deleteMany({ where: { item: "lottery_ticket" } })
        .then(() => exec('redis-cli KEYS "*inventory*" | xargs redis-cli DEL'));

      log(`winner: ${winner.winner} (${winnerUsername})`);

      await Promise.all([
        addBalance(winner.winner, total),
        addProgress(winner.winner, "lucky", 1),
        addStat(winner.winner, "earned-lottery", total),
      ]);

      const embed = new CustomEmbed();

      embed.setHeader("lottery winner", winnerAvatar);
      embed.setDescription(
        `**${winnerUsername}** has won the lottery with ${winner.amount.toLocaleString()} tickets!!\n\n` +
          `they have won $**${total.toLocaleString()}**`,
      );
      embed.setFooter({ text: `a total of ${ticketCount.toLocaleString()} tickets were bought` });
      embed.setColor(flavors.latte.colors.base.hex as ColorResolvable);

      await hook.send({ embeds: [embed] });

      hook.destroy();

      if ((await getDmSettings(winner.winner)).lottery) {
        embed.setTitle("you have won the lottery!");
        embed.setDescription(
          `you have won a total of $**${total.toLocaleString()}**\n\nyou had ${winner.amount.toLocaleString()} tickets`,
        );
        embed.setColor(flavors.latte.colors.base.hex as ColorResolvable);

        addNotificationToQueue({ memberId: winner.winner, payload: { embed } });

        if (percentChance(0.9) && !(await redis.exists(Constants.redis.nypsi.GEM_GIVEN))) {
          await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t", "EX", 86400);
          logger.info(`${winner.winner} received purple_gem randomly (mines)`);
          await addInventoryItem(winner.winner, "purple_gem", 1);
          addProgress(winner.winner, "gem_hunter", 1);

          if ((await getDmSettings(winner.winner)).other) {
            addNotificationToQueue({
              memberId: winner.winner,
              payload: {
                embed: new CustomEmbed(winner.winner)
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

async function findWinner() {
  const ticketUsers = await prisma.inventory.findMany({
    where: { item: "lottery_ticket" },
    select: { amount: true, userId: true },
  });
  const ticketCount = ticketUsers.map((i) => i.amount).reduce((a, b) => a + b);

  let percentages: { userId: string; percentage: number; amount: bigint }[] = [];

  const fillPercentages = (data: { userId: string; amount: bigint }[]) => {
    percentages.length = 0;
    for (const item of data) {
      percentages.push({
        userId: item.userId,
        amount: item.amount,
        percentage: (Number(item.amount) / Number(ticketCount)) * 100,
      });
    }
  };

  fillPercentages(ticketUsers);

  while (percentages.length > 1) {
    await sleep(50);
    fillPercentages(clone(percentages));

    const roundWinners: string[] = [];

    for (const item of percentages) {
      if (percentChance(item.percentage)) {
        roundWinners.push(item.userId);
      }
    }

    if (roundWinners.length > 0) {
      percentages = percentages.filter((i) => roundWinners.includes(i.userId));
    }
  }

  const winner = percentages[0];

  return {
    winner: winner.userId,
    amount: winner.amount,
  };
}
