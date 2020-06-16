const { MessageEmbed } = require("discord.js");
const { getColor } = require("../utils.js")

module.exports = {
    name: "invite",
    description: "generate an invite link for the bot",
    category: "info",
    run: async (message, args) => {
        const color = getColor(message.member)

        const embed = new MessageEmbed()
            .setTitle("nypsi")
            .setDescription("bot invite: [bot.tekoh.wtf](http://bot.tekoh.wtf)")
            .setColor(color)
            .setFooter("made by max#0777 | tekoh.wtf | racist.wtf")

        message.channel.send(embed)
    }
}