import { randomInt } from "crypto";
import { flavors } from "@catppuccin/palette";
import { ColorResolvable, WebhookClient } from "discord.js";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";
import { addProgress } from "../../utils/functions/economy/achievements";
import { addBalance, getBalance, removeBalance } from "../../utils/functions/economy/balance";
import { addInventoryItem, setInventoryItem } from "../../utils/functions/economy/inventory";
import { createLotteryEntry, getLotteryAutoBuyUsers } from "../../utils/functions/economy/lottery";
import { addStat } from "../../utils/functions/economy/stats";
import { getItems } from "../../utils/functions/economy/utils";
import { percentChance } from "../../utils/functions/random";
import { pluralize } from "../../utils/functions/string";
import { getTax } from "../../utils/functions/tax";
import { addNotificationToQueue, getDmSettings } from "../../utils/functions/users/notifications";
import { getLastKnownAvatar, getLastKnownUsername } from "../../utils/functions/users/username";
import { logger } from "../../utils/logger";
import pAll = require("p-all");

export default {
  name: "lottery",
  cron: "0 */8 * * *",
  async run(log) {
    const now = new Date();
    const isSuperDraw = now.getDay() === 6 && now.getHours() === 0;
    const drawTicketItems = isSuperDraw
      ? ["lottery_ticket", "superdraw_lottery_ticket"]
      : ["lottery_ticket"];

    await redis.set("nypsi:lottery", "boobies", "EX", 3600);
    const hook = new WebhookClient({ url: process.env.LOTTERY_HOOK });

    const ticketRows = await prisma.inventory.findMany({
      where: { item: { in: drawTicketItems } },
      select: { userId: true, item: true, amount: true },
    });

    const ticketMap = new Map<string, bigint>();

    for (const ticket of ticketRows) {
      ticketMap.set(ticket.userId, (ticketMap.get(ticket.userId) ?? 0n) + ticket.amount);
    }

    const tickets = Array.from(ticketMap.entries()).map(([userId, amount]) => ({ userId, amount }));
    const total = Number(tickets.map((i) => i.amount).reduce((a, b) => a + b, 0n));
    const lotteryTicketValue = getItems()["lottery_ticket"].buy;
    const totalPool = total * lotteryTicketValue;

    const uniqueUsers = ticketRows.reduce(
      (acc, curr) => acc.add(curr.userId),
      new Set<string>(),
    ).size;

    if (total < 500 || uniqueUsers < 10) {
      log(`${total} tickets were bought ): maybe tomorrow you'll have something to live for`);

      const embed = new CustomEmbed();

      embed.setTitle("lottery cancelled");
      embed.setDescription(
        `**ROLLOVER**\n\nnot enough participating tickets, existing tickets will rollover to the next draw`,
      );
      embed.setColor(flavors.latte.colors.base.hex as ColorResolvable);
      embed.disableFooter();

      await hook.send({ embeds: [embed] });
      hook.destroy();
    } else {
      const taxedAmount = Math.floor(totalPool * (await getTax())) * 1.5;

      const totalPrize = Math.floor(totalPool - taxedAmount);

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

      if (!isSuperDraw) {
        await addSuperdrawRolloverTickets(tickets, log);
      }

      await deleteAllTickets(
        tickets.map((i) => i.userId),
        isSuperDraw,
      );

      log(`winner: ${winner.userId} (${winnerUsername})`);

      await Promise.all([
        createLotteryEntry(
          winner.userId,
          winner.amount,
          total,
          isSuperDraw ? "superdraw" : "standard",
        ),
        addBalance(winner.userId, totalPrize),
        addProgress(winner.userId, "lucky", 1),
        addStat(winner.userId, "earned-lottery", totalPrize),
      ]);

      const embed = new CustomEmbed();

      embed.setHeader(`lottery winner`, winnerAvatar);
      embed.setDescription(
        `**${winnerUsername.replaceAll("_", "\\_")}** has won the ${isSuperDraw ? "**SUPERDRAW**" : ""} lottery with ${winner.amount.toLocaleString()} tickets!!\n\n` +
          `they have won $**${totalPrize.toLocaleString()}**`,
      );
      embed.setFooter({ text: `a total of ${total.toLocaleString()} tickets were bought` });
      embed.setColor(flavors.latte.colors.base.hex as ColorResolvable);

      await hook.send({ embeds: [embed] });

      hook.destroy();

      if ((await getDmSettings(winner.userId)).lottery) {
        embed.setTitle(`you have won the lottery!`);
        embed.setDescription(
          `you have won a total of $**${totalPrize.toLocaleString()}**\n\nyou had ${winner.amount.toLocaleString()} ${pluralize("ticket", winner.amount)}`,
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

    const isDailyAutoBuyRun = now.getHours() === 0;
    const autoBuys = await getLotteryAutoBuyUsers(isDailyAutoBuyRun);

    for (const user of autoBuys) {
      const balance = await getBalance(user.userId);

      const amount = user.autobuyLotteryTicketsAmount;

      if (!amount || amount <= 0) {
        continue;
      }

      const cost = Math.ceil(getItems()["lottery_ticket"].buy * amount * 0.95);

      if (balance >= cost) {
        log(`auto buying ${amount} lottery tickets for ${user.userId}`);
        await removeBalance(user.userId, cost);
        addStat(user.userId, "spent-shop", cost);
        await addInventoryItem(user.userId, "lottery_ticket", amount);

        if (user.user.DMSettings.other) {
          await addNotificationToQueue({
            memberId: user.userId,
            payload: {
              embed: new CustomEmbed(
                user.userId,
                `you have auto bought **${amount}** lottery tickets`,
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

async function deleteAllTickets(userIds: string[], isSuperDraw: boolean) {
  const promises: (() => Promise<void>)[] = [];

  for (const userId of userIds) {
    promises.push(() => setInventoryItem(userId, "lottery_ticket", 0));

    if (isSuperDraw) {
      promises.push(() => setInventoryItem(userId, "superdraw_lottery_ticket", 0));
    }
  }

  await pAll(promises, { concurrency: 5 });
}

function getSuperdrawChance(ticketAmount: number): number {
  const maxChance = 0.1;
  const minChance = 0.025;
  const maxTicketsForMinChance = 1000;

  const clamped = Math.min(Math.max(ticketAmount, 1), maxTicketsForMinChance);
  const t = (clamped - 1) / (maxTicketsForMinChance - 1);
  const progress = 1 - Math.pow(1 - t, 5);

  return maxChance - (maxChance - minChance) * progress;
}

function rollSuperdrawTickets(ticketAmount: number): number {
  const chance = getSuperdrawChance(ticketAmount);
  let granted = 0;

  for (let i = 0; i < ticketAmount; i++) {
    if (percentChance(chance)) {
      granted++;
    }
  }

  return granted;
}

async function addSuperdrawRolloverTickets(
  tickets: { userId: string; amount: bigint }[],
  log: (message: string) => void,
) {
  const tasks: (() => Promise<void>)[] = [];

  for (const ticket of tickets) {
    const amount = Number(ticket.amount);

    if (!amount || amount <= 0) {
      continue;
    }

    const granted = rollSuperdrawTickets(amount);

    if (granted <= 0) {
      continue;
    }

    tasks.push(async () => {
      await addInventoryItem(ticket.userId, "superdraw_lottery_ticket", granted);
      log(`rolled ${granted} superdraw tickets for ${ticket.userId} from ${amount} tickets`);
    });
  }

  await pAll(tasks, { concurrency: 5 });
}
