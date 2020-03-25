const { RichEmbed } = require("discord.js")

module.exports = {
    name: "snipe",
    description: "snipe the most recently deleted message",
    category: "fun",
    run: async (message, args) => {
        const { snipe } = require("../nypsi.js")

        if (!snipe || !snipe.get(message.guild.id)) {
            return message.channel.send("❌\nnothing to snipe")
        }

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        let embed = new RichEmbed()
            .setColor(color)
            .setTitle(snipe.get(message.guild.id).member.user.tag)
            .setDescription(snipe.get(message.guild.id).content)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();
        
        message.channel.send(embed)

    }
}