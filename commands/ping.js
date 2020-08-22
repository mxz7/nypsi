const { MessageEmbed } = require("discord.js")
const { getColor } = require("../utils/utils")

module.exports = {
    name: "ping",
    description: "get the ping",
    category: "info",
    aliases: ["latency"],
    run: async (message, args) => {
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
}