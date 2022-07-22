import * as chalk from "chalk";
import { Client, User, WebhookClient } from "discord.js";
import * as winston from "winston";
import "winston-daily-rotate-file";
import * as DiscordTransport from "winston-discord-webhook";

const webhook: Map<string, WebhookClient> = new Map();
const nextLogMsg: Map<string, string> = new Map();

let clusterId: number | string;

export function setClusterId(id: number | string) {
    clusterId = id;
}

const format = winston.format.printf(({ level, message, timestamp }) => {
    let color = chalk.white;
    let prefix = `${chalk.bold.green("INFO")}`;

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
        case "img":
            color = chalk.green;
            break;
        case "error":
            color = chalk.red;
            prefix = `${chalk.bold.redBright("ERROR")}`;
            break;
        case "warn":
            color = chalk.yellowBright;
            prefix = `${chalk.bold.yellowBright("WARN")}`;
            break;
        case "debug":
            prefix = `${chalk.bold.gray("DEBUG")}`;
            break;
    }

    return `${prefix} [${chalk.blackBright(timestamp)}${
        typeof clusterId != "undefined" ? ` ${chalk.blackBright(clusterId)}` : ""
    }] ${color(message)}`;
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
    format: winston.format.combine(winston.format.timestamp({ format: "DD/MM HH:mm:ss" }), format),
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
            maxSize: "5m",
            maxFiles: "90d",
            format: winston.format.simple(),
        }),
        new winston.transports.Console({
            level: "debug",
        }),
    ],
});

export { logger };

export function payment(from: User, to: User, amount: number) {
    if (!nextLogMsg.get("pay")) {
        nextLogMsg.set(
            "pay",
            `**${from.tag}** (${from.id}) -> **${to.tag}** (${to.id}) - $**${amount.toLocaleString()}**\n`
        );
    } else {
        nextLogMsg.set(
            "pay",
            nextLogMsg.get("pay") +
                `**${from.tag}** (${from.id}) -> **${to.tag}** (${to.id}) - $**${amount.toLocaleString()}**\n`
        );
    }
}

export function gamble(user: User, game: string, amount: number, win: boolean, winAmount?: number) {
    if (!nextLogMsg.get("gamble")) {
        nextLogMsg.set(
            "gamble",
            `**${user.tag}** (${user.id}) - **${game}** - ${win ? "won" : "lost"}${
                win ? ` ($**${winAmount.toLocaleString()}**)` : ""
            } - $**${amount.toLocaleString()}**\n`
        );
    } else {
        nextLogMsg.set(
            "gamble",
            nextLogMsg.get("gamble") +
                `**${user.tag}** (${user.id}) - **${game}** - ${win ? "won" : "lost"}${
                    win ? ` ($**${winAmount.toLocaleString()}**)` : ""
                } - $**${amount.toLocaleString()}**\n`
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

export async function getWebhooks(client: Client) {
    if (client.user.id != "678711738845102087") return;

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

    logger.add(
        new DiscordTransport({
            webhook: process.env.BOTLOGS_HOOK,
            useCodeblock: true,
        })
    );
}

function runLogs() {
    if (process.env.GITHUB_ACTION) return;
    setInterval(() => {
        webhook.forEach((v, k) => {
            const msg = nextLogMsg.get(k);

            if (msg != "" && msg) {
                v.send({ content: msg });
                nextLogMsg.set(k, "");
            }
        });
    }, 2500);
}
