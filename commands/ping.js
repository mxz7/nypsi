const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("ping", "get ping/latency of the bot and api", categories.INFO).setAliases([
    "latency",
])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    const now = new Date().getTime()

    const msg = await message.channel.send("pinging..")

    const embed = new CustomEmbed(
        message.member,
        false,
        "**bot** `~ " +
            (new Date().getTime() - now) +
            "ms`\n" +
            "**api** `~ " +
            Math.round(message.client.ws.ping) +
            "ms`"
    ).setFooter("nypsi is hosted in new jersey - us east")

    return await msg.edit(embed)
}

cmd.setRun(run)

module.exports = cmd
