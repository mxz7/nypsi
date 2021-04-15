const { Client, Webhook, User } = require("discord.js")

/**
 * @type {Map<String, Webhook>}
 */
let webhook = new Map()
/**
 * @type {Map<String, Webhook>}
 */
let nextLogMsg = new Map()

function info(string, type) {
    let color

    if (!type) type = types.INFO

    switch (type) {
        case types.INFO:
            color = "\x1b[37m"
            break
        case types.GUILD:
            color = "\x1b[36m"
            break
        case types.ECONOMY:
            color = "\x1b[32m"
            break
        case types.DATA:
            color = "\x1b[32m"
            break
        case types.AUTOMATION:
            color = "\x1b[34m"
            break
        case types.COMMAND:
            color = "\x1b[33m"
            break
        case types.IMAGE:
            color = "\x1b[32m"
            break
    }

    const day = new Date().getDate()
    const month = new Date().getMonth() + 1

    const out = `${color}[${day}/${month} ${getTimestamp()}] [${type}] ${string} \x1b[0m`
    console.log(out)

    if (!nextLogMsg.get("logs")) {
        nextLogMsg.set("logs", `\`\`\`[${day}/${month} ${getTimestamp()}] [${type}] ${string}\`\`\``)
    } else {
        nextLogMsg.set("logs", nextLogMsg.get("logs") + `\`\`\`[${day}/${month} ${getTimestamp()}] [${type}] ${string}\`\`\``)
    }
}

exports.info = info

function error(string) {
    console.error(`\x1B[31m[${getTimestamp()}] [error] ${string}\x1B[0m`)
    if (!nextLogMsg.get("logs")) {
        nextLogMsg.set("logs", `\`\`\`[${getTimestamp()}] [error] ${string}\`\`\``)
    } else {
        nextLogMsg.set("logs", nextLogMsg.get("logs") + `\`\`\`[${getTimestamp()}] [error] ${string}\`\`\``)
    }
}

exports.error = error

/**
 * 
 * @param {User} from 
 * @param {User} to 
 * @param {Number} amount 
 */
function payment(from, to, amount) {
    if (!nextLogMsg.get("pay")) {
        nextLogMsg.set("pay", `**${from.tag}** (${from.id}) -> **${to.tag}** (${to.id}) - $**${amount.toLocaleString()}**`)
    } else {
        nextLogMsg.set(
            "pay",
            nextLogMsg.get("pay") +
                `**${from.tag}** (${from.id}) -> **${to.tag}** (${to.id}) - $**${amount.toLocaleString()}**`
        )
    }
}

exports.payment = payment

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
    // if (client.user.id != "678711738845102087") return

    const guild = await client.guilds.fetch("747056029795221513")

    if (!guild) {
        return error("UNABLE TO GET GUILD FOR LOGS")
    }

    const webhooks = await guild.fetchWebhooks()

    const allLogs = await webhooks.find((w) => w.id == "830799277407600640")

    webhook.set("logs", allLogs)
    info(`logs webhook running ${allLogs.id}`)

    const paymentLogs = await webhooks.find((w) => w.id == "832299144186036266")

    webhook.set("pay", paymentLogs)
    info(`payment logs webhook running ${paymentLogs.id}`)

    const gambleLogs = await webhooks.find((w) => w.id == "832299675309965333")

    webhook.set("gamble", gambleLogs)
    info(`gamble logs webhook running ${gambleLogs.id}`)

    runLogs()
}

exports.getWebhooks = getWebhooks

function runLogs() {
    setInterval(() => {
        webhook.forEach((v, k) => {
            let msg = nextLogMsg.get(k)

            if (msg != "" && msg) {
                v.send(msg)
                nextLogMsg.set(k, "")
            }
        })
    }, 2500)
}
