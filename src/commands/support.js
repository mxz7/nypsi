const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")

const cmd = new Command("support", "join the nypsi support server", categories.INFO)

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message) {
    return message.channel.send({ content: "discord.gg/hJTDNST" })
}

cmd.setRun(run)

module.exports = cmd
