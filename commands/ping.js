const { MessageEmbed, Message } = require("discord.js");
const { Command, categories } = require("../utils/classes/Command");
const { getColor } = require("../utils/utils")

const cmd = new Command("ping", "get ping/latency of the bot and api", categories.INFO).setAliases(["latency"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    const msg = await message.channel.send("pinging..")

    const latency = msg.createdTimestamp - message.createdTimestamp

    const color = getColor(message.member)

    const embed = new MessageEmbed()
        .setColor(color)
        .setDescription("**bot** - `" + latency + "ms`\n" +
            "**api** - `" + Math.round(message.client.ws.ping) + "ms`")
        .setFooter("nypsi is hosted in an NYC data center")
    
    return await msg.edit(embed)

}

cmd.setRun(run)

module.exports = cmd