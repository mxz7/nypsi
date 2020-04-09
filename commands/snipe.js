const { MessageEmbed } = require("discord.js")
const { getColor } = require("../utils.js")

module.exports = {
    name: "snipe",
    description: "snipe the most recently deleted message",
    category: "fun",
    run: async (message, args) => {
        const { snipe } = require("../nypsi.js")

        if (!snipe || !snipe.get(message.channel.id)) {
            return message.channel.send("❌\nnothing to snipe")
        }

        let content = snipe.get(message.channel.id).content

        if (content) {
            if (snipe.get(message.channel.id).attachments.url) {
                content = snipe.get(message.channel.id).attachments.url
            }
        }

        const color = getColor(message.member);

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle(snipe.get(message.channel.id).member.user.tag)
            .setDescription(content)

            .setFooter("bot.tekoh.wtf")
        
        message.channel.send(embed)

    }
}