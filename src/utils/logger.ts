import * as chalk from "chalk";
import { Client, User, WebhookClient } from "discord.js";
import * as winston from "winston";
import "winston-daily-rotate-file";
import * as DiscordTransport from "winston-discord-webhook";

const webhook = new Map<string, WebhookClient>();
const nextLogMsg = new Map<string, string>();

let clusterId: number | string;

export function setClusterId(id: number | string) {
  clusterId = id;
}

const format = winston.format.printf(({ level, message, timestamp }) => {
  let color = chalk.reset;
  let prefix = `${chalk.green("[info]")}`;

  if (typeof message == "object") message = JSON.stringify(message, null, 2);

  switch (level) {
    case "guild":
      color = chalk.magenta;
      break;
    case "auto":
      color = chalk.blue;
      break;
    case "cmd":
      color = chalk.cyan;
      break;
    case "success":
      color = chalk.green;
      break;
    case "error":
      color = chalk.red;
      prefix = `${chalk.bold.redBright("[error]")}`;
      break;
    case "warn":
      color = chalk.yellowBright;
      prefix = `${chalk.bold.yellowBright("[warn]")}`;
      break;
    case "debug":
      prefix = `${chalk.gray("[debug]")}`;
      break;
  }

  return `[${chalk.blackBright.italic(timestamp)}] [${
    typeof clusterId != "undefined" ? `${chalk.blackBright(clusterId)}` : ""
  }] ${prefix} ${color(message)}`;
});

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  guild: 2,
  auto: 2,
  cmd: 2,
  img: 2,
  success: 2,
  debug: 3,
};

const logger = winston.createLogger({
  format: winston.format.combine(winston.format.timestamp({ format: "HH:mm:ss" }), format),
  exitOnError: false,
  levels: levels,

  transports: [
    new winston.transports.DailyRotateFile({
      filename: "./out/logs/errors-%DATE%.log",
      datePattern: "YYYY-MM",
      maxSize: "5m",
      maxFiles: "14d",
      format: winston.format.simple(),
      level: "warn",
      handleExceptions: true,
      handleRejections: true,
    }),
    new winston.transports.DailyRotateFile({
      filename: "./out/logs/out-%DATE%.log",
      datePattern: "YYYY-MM",
      level: "debug",
      maxSize: "5m",
      maxFiles: "90d",
      format: winston.format.simple(),
    }),
    new winston.transports.Console({
      level: "debug",
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
});

export { logger };

export function payment(from: User, to: User, value: string) {
  if (!nextLogMsg.get("pay")) {
    nextLogMsg.set("pay", `**${from.tag}** (${from.id}) -> **${to.tag}** (${to.id}) - **${value}**\n`);
  } else {
    nextLogMsg.set(
      "pay",
      nextLogMsg.get("pay") + `**${from.tag}** (${from.id}) -> **${to.tag}** (${to.id}) - **${value}**\n`
    );
  }
}

export function gamble(user: User, game: string, amount: number, win: boolean, id: string, winAmount?: number) {
  if (!nextLogMsg.get("gamble")) {
    nextLogMsg.set(
      "gamble",
      `**${user.tag}** (${user.id}) - **${game}** - ${win ? "won" : "lost"}${
        win ? ` ($**${winAmount.toLocaleString()}**)` : ""
      } - $**${amount.toLocaleString()}** **id** ${id}\n`
    );
  } else {
    nextLogMsg.set(
      "gamble",
      nextLogMsg.get("gamble") +
        `**${user.tag}** (${user.id}) - **${game}** - ${win ? "won" : "lost"}${
          win ? ` ($**${winAmount.toLocaleString()}**)` : ""
        } - $**${amount.toLocaleString()}** **id** ${id}\n`
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
  if (client && client.user.id != "678711738845102087") return;

  if (client) {
    webhook.set(
      "pay",
      new WebhookClient({
        url: process.env.PAYMENTS_HOOK,
      })
    );

    webhook.set(
      "gamble",
      new WebhookClient({
        url: process.env.GAMBLE_HOOK,
      })
    );

    runLogs();
  }

  logger.add(
    new DiscordTransport({
      webhook: process.env.BOTLOGS_HOOK,
      useCodeblock: true,
    })
  );
}

function runLogs() {
  setInterval(() => {
    webhook.forEach((v, k) => {
      const msg = nextLogMsg.get(k);

      if (msg != "" && msg) {
        v.send({ content: msg });
        nextLogMsg.set(k, "");
      }
    });
  }, 5000);
}
