const { Client, Webhook, User } = require("discord.js")
const winston = require("winston")
require("winston-daily-rotate-file")
const clc = require("cli-color")

/**
 * @type {Map<String, Webhook>}
 */
let webhook = new Map()
/**
 * @type {Map<String, String>}
 */
let nextLogMsg = new Map()

const format = winston.format.printf(({ level, message, timestamp }) => {
    if (level == "error") {
        return `[${clc.blackBright(timestamp)}] ${clc.red(`[error] ${message}`)}`
    } else if (level == "warn") {
        return `[${clc.blackBright(timestamp)}] ${clc.yellowBright(`[warn] ${message}`)}`
    } else {
        let color = clc.white

        switch (level) {
            case "guild":
                color = clc.blue
                break
            case "economy":
                color = clc.green
                break
            case "auto":
                color = clc.blue
                break
            case "cmd":
                color = clc.yellow
                break
            case "img":
                color = clc.green
                break
        }

        return `[${clc.blackBright(timestamp)}] ${color(message)}`
    }
})

const levels = {
    error: 0,
    warn: 1,
    info: 2,
    guild: 2,
    economy: 2,
    auto: 2,
    cmd: 2,
    img: 2,
    debug: 3
}

const logger = winston.createLogger({
    format: winston.format.combine(winston.format.timestamp({ format: "DD/MM HH:mm:ss" }), format),

    levels: levels,

    transports: [
        new winston.transports.DailyRotateFile({
            filename: "./logs/error-%DATE%.log",
            datePattern: "MMMM",
            zippedArchive: true,
            maxSize: "20m",
            maxFiles: "14d",
            format: winston.format.simple(),
        }),
        new winston.transports.DailyRotateFile({
            filename: "./logs/warn-%DATE%.log",
            datePattern: "MMMM",
            zippedArchive: true,
            maxSize: "20m",
            maxFiles: "14d",
            format: winston.format.simple(),
        }),
        new winston.transports.DailyRotateFile({
            filename: "./logs/info-%DATE%.log",
            datePattern: "MMMM",
            zippedArchive: true,
            maxSize: "20m",
            maxFiles: "90d",
            format: winston.format.simple(),
        }),
        new winston.transports.Console(),
    ],
})

exports.logger = logger

function info(string, type) {
    let color

    if (!type) type = types.INFO

    switch (type) {
        case types.INFO:
            color = clc.white
            break
        case types.GUILD:
            color = clc.blue
            break
        case types.ECONOMY:
            color = clc.green
            break
        case types.DATA:
            color = clc.green
            break
        case types.AUTOMATION:
            color = clc.blue
            break
        case types.COMMAND:
            color = clc.yellow
            break
        case types.IMAGE:
            color = clc.green
            break
    }

    const day = new Date().getDate()
    const month = new Date().getMonth() + 1

    const out = `[${clc.blackBright(`${day}/${month} ${getTimestamp()}`)}] ${color(string)}`
    console.log(out)

    const webhookLog = `\`\`\`${day}/${month} ${getTimestamp()} ${string}\`\`\``

    if (!nextLogMsg.get("logs")) {
        nextLogMsg.set("logs", webhookLog)
    } else {
        nextLogMsg.set("logs", nextLogMsg.get("logs") + webhookLog)
    }
}

exports.info = info

function error(string) {
    const day = new Date().getDate()
    const month = new Date().getMonth() + 1

    console.error(`[${clc.black(`${day}/${month} ${getTimestamp()}`)}] ${clc.red(string)}`)
    if (!nextLogMsg.get("logs")) {
        nextLogMsg.set("logs", `\`\`\`${day}/${month} ${getTimestamp()} ${string}\`\`\``)
    } else {
        nextLogMsg.set("logs", nextLogMsg.get("logs") + `\`\`\`${day}/${month} ${getTimestamp()} ${string}\`\`\``)
    }
}

exports.error = error

/**
 *
 * @param {String} content
 */
function databaseLog(content) {
    const day = new Date().getDate()
    const month = new Date().getMonth() + 1

    content = `${day}/${month} ${getTimestamp()} ${content}\n\n`

    if (!nextLogMsg.get("sql")) {
        nextLogMsg.set("sql", content)
    } else {
        let current = nextLogMsg.get("sql")

        if (current.length >= 1500) {
            let lastLine = current.substr(current.lastIndexOf("\n"), 50)

            const amount = parseInt(lastLine.split(" ")[0].substr("1", lastLine.length))

            if (!amount) {
                lastLine = "+1 more"
            } else {
                lastLine = `+${amount + 1} more`
            }

            current = current.substr(0, 1500) + "\n\n" + lastLine
        } else {
            current = current + content
        }

        nextLogMsg.set("sql", current)
    }
}

exports.databaseLog = databaseLog

/**
 *
 * @param {User} from
 * @param {User} to
 * @param {Number} amount
 */
function payment(from, to, amount) {
    if (!nextLogMsg.get("pay")) {
        nextLogMsg.set("pay", `**${from.tag}** (${from.id}) -> **${to.tag}** (${to.id}) - $**${amount.toLocaleString()}**\n`)
    } else {
        nextLogMsg.set(
            "pay",
            nextLogMsg.get("pay") +
                `**${from.tag}** (${from.id}) -> **${to.tag}** (${to.id}) - $**${amount.toLocaleString()}**\n`
        )
    }
}

exports.payment = payment

/**
 *
 * @param {User} user
 * @param {String} game
 * @param {Number} amount
 * @param {Boolean} win
 * @param {Number} winAmount
 */
function gamble(user, game, amount, win, winAmount) {
    if (!nextLogMsg.get("gamble")) {
        nextLogMsg.set(
            "gamble",
            `**${user.tag}** (${user.id}) - **${game}** - ${win ? "won" : "lost"}${
                win ? ` ($**${winAmount.toLocaleString()}**)` : ""
            } - $**${amount.toLocaleString()}**\n`
        )
    } else {
        nextLogMsg.set(
            "gamble",
            nextLogMsg.get("gamble") +
                `**${user.tag}** (${user.id}) - **${game}** - ${win ? "won" : "lost"}${
                    win ? ` ($**${winAmount.toLocaleString()}**)` : ""
                } - $**${amount.toLocaleString()}**\n`
        )
    }
}

exports.gamble = gamble

const types = {
    INFO: "info",
    DATA: "data",
    GUILD: "guild",
    ECONOMY: "eco",
    AUTOMATION: "auto",
    COMMAND: "command",
    IMAGE: "image",
}

exports.types = types

/**
 * @returns {String}
 */
function getTimestamp() {
    const date = new Date()
    let hours = date.getHours().toString()
    let minutes = date.getMinutes().toString()
    let seconds = date.getSeconds().toString()

    if (hours.length == 1) {
        hours = "0" + hours
    }

    if (minutes.length == 1) {
        minutes = "0" + minutes
    }

    if (seconds.length == 1) {
        seconds = "0" + seconds
    }

    const timestamp = hours + ":" + minutes + ":" + seconds

    return timestamp
}

exports.getTimestamp = getTimestamp

/**
 *
 * @param {Client} client
 */
async function getWebhooks(client) {
    if (client.user.id != "678711738845102087") return

    const guild = await client.guilds.fetch("747056029795221513")

    if (!guild) {
        return error("UNABLE TO GET GUILD FOR LOGS")
    }

    const webhooks = await guild.fetchWebhooks()

    const paymentLogs = await webhooks.find((w) => w.id == "832299144186036266")

    webhook.set("pay", paymentLogs)
    info(`payment logs webhook running ${paymentLogs.id}`)

    const gambleLogs = await webhooks.find((w) => w.id == "832299675309965333")

    webhook.set("gamble", gambleLogs)
    info(`gamble logs webhook running ${gambleLogs.id}`)

    const sqlLogs = await webhooks.find((w) => w.id == "845028787681755176")

    webhook.set("sql", sqlLogs)
    info(`sql logs webhook running ${sqlLogs.id}`)

    runLogs()
}

exports.getWebhooks = getWebhooks

function runLogs() {
    if (process.env.GITHUB_ACTION) return
    setInterval(() => {
        webhook.forEach((v, k) => {
            let msg = nextLogMsg.get(k)

            if (msg != "" && msg) {
                v.send({ content: msg })
                nextLogMsg.set(k, "")
            }
        })
    }, 2500)
}
