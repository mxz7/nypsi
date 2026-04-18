import { Client, User, WebhookClient } from "discord.js";
import { TransactionType } from "#generated/prisma";
import prisma from "../init/database";
import Constants from "./Constants";
import { escapeFormattingCharacters } from "./functions/string";
import { formatTransaction } from "./functions/transactions";

const webhook = new Map<string, string>();
const nextLogMsg = new Map<string, string>();

export async function transaction(
  from: string | { id: string },
  to: string | { id: string },
  type: TransactionType,
  amount: number | bigint,
  itemId?: string,
  notes?: string,
) {
  const tx = await prisma.transaction.create({
    data: {
      sourceId: typeof from === "string" ? from : from.id,
      targetId: typeof to === "string" ? to : to.id,
      type,
      amount,
      itemId,
      notes,
    },
  });

  const msg = await formatTransaction(tx, "discord");

  if (!nextLogMsg.get("pay")) {
    nextLogMsg.set("pay", `${msg}\n`);
  } else {
    nextLogMsg.set("pay", nextLogMsg.get("pay") + `${msg}\n`);
  }
}

export function gamble(
  user: User,
  game: string,
  amount: number,
  result: string,
  id: string,
  winAmount?: number,
) {
  if (!nextLogMsg.get("gamble")) {
    nextLogMsg.set(
      "gamble",
      `**${escapeFormattingCharacters(user.username)}** (${user.id})\n` +
        `- **game** ${game}\n` +
        `- **bet** $${amount.toLocaleString()}\n` +
        `- **result** ${result}${
          result == "win" ? ` ($**${winAmount.toLocaleString()}**)` : ""
        }\n` +
        `- **id** ${id}\n` +
        `- **time** <t:${Math.floor(Date.now() / 1000)}>\n`,
    );
  } else {
    nextLogMsg.set(
      "gamble",
      nextLogMsg.get("gamble") +
        `**${escapeFormattingCharacters(user.username)}** (${user.id})\n` +
        `- **game** ${game}\n` +
        `- **bet** $${amount.toLocaleString()}\n` +
        `- **result** ${result}${
          result == "win" ? ` ($**${winAmount.toLocaleString()}**)` : ""
        }\n` +
        `- **id** ${id}\n` +
        `- **time** <t:${Math.floor(Date.now() / 1000)}>\n`,
    );
  }
}

export async function getWebhooks(client?: Client) {
  if (client && client.user.id != Constants.BOT_USER_ID) return;

  if (client) {
    webhook.set("pay", process.env.PAYMENTS_HOOK);

    webhook.set("gamble", process.env.GAMBLE_HOOK);

    runLogs();
  }
}

function runLogs() {
  setInterval(() => {
    webhook.forEach((v, k) => {
      const msg = nextLogMsg.get(k);

      if (msg != "" && msg) {
        const hook = new WebhookClient({ url: v });
        hook.send({ content: msg });
        nextLogMsg.set(k, "");
        hook.destroy();
      }
    });
  }, 7500);
}
