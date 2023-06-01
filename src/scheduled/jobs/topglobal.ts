import { variants } from "@catppuccin/palette";
import { ColorResolvable, EmbedBuilder, WebhookClient } from "discord.js";
import { parentPort } from "worker_threads";
import prisma from "../../init/database";
import dayjs = require("dayjs");

(async () => {
  const baltop = await topAmountGlobal(10);

  const embed = new EmbedBuilder();

  embed.setTitle("top 10 richest users");
  embed.setDescription(baltop.join("\n"));
  embed.setColor(variants.latte.base.hex as ColorResolvable);

  const hook = new WebhookClient({ url: process.env.TOPGLOBAL_HOOK });

  await hook.send({ embeds: [embed] }).catch(() => {
    parentPort.postMessage("failed to send global baltop");
    process.exit(1);
  });

  parentPort.postMessage("sent global baltop");

  hook.destroy();
  process.exit(0);
})();

async function topAmountGlobal(amount: number): Promise<string[]> {
  const query = await prisma.economy.findMany({
    select: {
      userId: true,
      money: true,
      banned: true,
      user: {
        select: {
          Preferences: {
            select: {
              leaderboards: true,
            },
          },
          lastKnownTag: true,
        },
      },
    },
    orderBy: {
      money: "desc",
    },
    take: 50,
  });

  const usersFinal = [];

  let count = 0;

  for (const user of query) {
    if (count >= amount) break;
    if (usersFinal.join().length >= 1500) break;
    if (user.banned && dayjs().isBefore(user.banned)) continue;

    let pos: number | string = count + 1;

    if (pos == 1) {
      pos = "🥇";
    } else if (pos == 2) {
      pos = "🥈";
    } else if (pos == 3) {
      pos = "🥉";
    }

    usersFinal[count] =
      pos +
      " **" +
      (user.user?.Preferences?.leaderboards ? user.user.lastKnownTag.split("#")[0] : "[hidden]") +
      "** $" +
      user.money.toLocaleString();
    count++;
  }
  return usersFinal;
}
