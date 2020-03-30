const { MessageEmbed } = require("discord.js")

module.exports = {
    name: "color",
    description: "get a random hex color code",
    category: "info",
    run: async (message, args) => {

        let color = Math.floor(Math.random() * 16777215).toString(16)

        if (args.length != 0) {
            color = args[0].split("#").join("")
        }

        const embed = new MessageEmbed()
            .setTitle("#" + color)
            .setColor(color)
            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")
        message.channel.send(embed)

    }
}