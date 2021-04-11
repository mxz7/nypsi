const { Client, Webhook } = require("discord.js")

/**
 * @type {Webhook}
 */
let webhook
let nextLogMsg = ""
let logsRunning = false

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
    nextLogMsg += `\`\`\`[${day}/${month} ${getTimestamp()}] [${type}] ${string}\`\`\``
}

exports.info = info

function error(string) {
    console.error(`\x1B[31m[${getTimestamp()}] [error] ${string}\x1B[0m`)
    nextLogMsg += `\`\`\`[${getTimestamp()}] [error] ${string}\`\`\``
}

exports.error = error

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
async function getWebhook(client) {
    if (client.user.id != "678711738845102087") return

    const guild = await client.guilds.fetch("747056029795221513")

    if (!guild) {
        return error("UNABLE TO GET GUILD FOR LOGS")
    }

    const webhooks = await guild.fetchWebhooks()

    webhook = await webhooks.find((w) => w.id == "830799277407600640")

    runLogs()

    info(`logs webhook running ${webhook.id}`)
}

exports.getWebhook = getWebhook

function runLogs() {
    if (logsRunning) return

    logsRunning = true

    setInterval(() => {
        if (nextLogMsg == "") {
            return
        }
        webhook.send(nextLogMsg)

        nextLogMsg = ""
    }, 2500)
}
