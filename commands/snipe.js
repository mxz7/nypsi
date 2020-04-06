const { MessageEmbed } = require("discord.js")

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

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle(snipe.get(message.channel.id).member.user.tag)
            .setDescription(content)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")
        
        message.channel.send(embed)

    }
}