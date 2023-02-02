import { variants } from "@catppuccin/palette";
import { ColorResolvable, EmbedBuilder, WebhookClient } from "discord.js";
import { inPlaceSort } from "fast-sort";
import { parentPort } from "worker_threads";
import prisma from "../../init/database";
import dayjs = require("dayjs");

(async () => {
  const baltop = await topAmountGlobal(10, true);

  const embed = new EmbedBuilder();

  embed.setTitle("top 10 richest users");
  embed.setDescription(baltop.join("\n"));
  embed.setColor(variants.latte.base.hex as ColorResolvable);

  const hook = new WebhookClient({ url: process.env.TOPGLOBAL_HOOK });

  await hook
    .send({ embeds: [embed] })
    .then(() => {
      parentPort.postMessage("sent global baltop");
      process.exit(0);
    })
    .catch(() => {
      parentPort.postMessage("failed to send global baltop");
      process.exit(1);
    });

  hook.destroy();
})();

async function topAmountGlobal(amount: number, anon = true): Promise<string[]> {
  const query = await prisma.economy.findMany({
    where: {
      money: { gt: 1000 },
    },
    select: {
      userId: true,
      money: true,
      banned: true,
      user: {
        select: {
          lastKnownTag: true,
        },
      },
    },
    orderBy: {
      money: "desc",
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
    if (query.find((u) => u.userId == user).banned && dayjs().isBefore(query.find((u) => u.userId == user).banned)) continue;

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

      if (anon) {
        username = username.split("#")[0];
      }

      if (!username || username == "") {
        count--;
        continue;
      }

      usersFinal[count] = pos + " **" + username + "** $" + balances.get(user).toLocaleString();
      count++;
    }
  }
  return usersFinal;
}
