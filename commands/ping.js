const { Message } = require("discord.js");
const { Command, categories } = require("../utils/classes/Command");
const { CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("ping", "get ping/latency of the bot and api", categories.INFO).setAliases(["latency"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    const ping = message.createdTimestamp - Date.now()

    const embed = new CustomEmbed(message.member, false, "**bot** - `" + ping + "ms`\n" +
        "**api** - `" + Math.round(message.client.ws.ping) + "ms`")
        .setFooter("nypsi is hosted in an NYC data center")
    
    return await message.channel.send(embed)

}

cmd.setRun(run)

module.exports = cmd