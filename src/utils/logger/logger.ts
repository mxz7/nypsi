import { Client, User, WebhookClient } from "discord.js";
import { pino } from "pino";
import Constants from "../Constants";

const webhook = new Map<string, string>();
const nextLogMsg = new Map<string, string>();

const baseLogger = pino({
  base: undefined,
  transport: {
    targets: [
      { target: "./pino-pretty-transport", level: "trace", options: { colorize: true } },
      { target: "pino/file", level: "trace", options: { destination: "./out/combined.log", mkdir: true } },
      { target: "pino/file", level: "warn", options: { destination: "./out/errors.log", mkdir: true } },
    ],
  },
});

export { baseLogger as logger };

export function setClusterId(id: number | string) {
  const childLogger = baseLogger.child({ pid: id });
  exports.logger = childLogger;
}

export function transaction(from: User, to: User, value: string) {
  if (!nextLogMsg.get("pay")) {
    nextLogMsg.set("pay", `**${from.tag}** (${from.id}) -> **${to.tag}** (${to.id})\n - **${value}**\n`);
  } else {
    nextLogMsg.set(
      "pay",
      nextLogMsg.get("pay") + `**${from.tag}** (${from.id}) -> **${to.tag}** (${to.id})\n - **${value}**\n`
    );
  }
}

export function gamble(user: User, game: string, amount: number, win: boolean, id: string, winAmount?: number) {
  if (!nextLogMsg.get("gamble")) {
    nextLogMsg.set(
      "gamble",
      `**${user.tag}** (${user.id})\n` +
        ` - **game** ${game}\n` +
        ` - **bet** $${amount.toLocaleString()}\n` +
        ` - **win** ${win}${win ? ` ($**${winAmount.toLocaleString()}**)` : ""}\n` +
        ` - **id** ${id}\n`
    );
  } else {
    nextLogMsg.set(
      "gamble",
      nextLogMsg.get("gamble") +
        `**${user.tag}** (${user.id})\n` +
        ` - **game** ${game}\n` +
        ` - **bet** $${amount.toLocaleString()}\n` +
        ` - **win** ${win}${win ? ` ($**${winAmount.toLocaleString()}**)` : ""}\n` +
        ` - **id** ${id}\n`
    );
  }
}

export function getTimestamp(): string {
  const date = new Date();
  let hours = date.getHours().toString();
  let minutes = date.getMinutes().toString();
  let seconds = date.getSeconds().toString();

  if (hours.length == 1) {
    hours = "0" + hours;
  }

  if (minutes.length == 1) {
    minutes = "0" + minutes;
  }

  if (seconds.length == 1) {
    seconds = "0" + seconds;
  }

  const timestamp = hours + ":" + minutes + ":" + seconds;

  return timestamp;
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
