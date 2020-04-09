const { MessageEmbed } = require("discord.js")
const { getMember } = require("../utils.js")

module.exports = {
    name: "color",
    description: "get a random hex color code",
    category: "info",
    run: async (message, args) => {

        let color
        let member

        if (args.length == 0) {
            color = Math.floor(Math.random() * 16777215).toString(16)
        }

        if (args.length != 0) {

            if (!message.mentions.members.first()) {
                member = getMember(message, args[0]);
            } else {
                member = message.mentions.members.first();
            }

            if (!member) {
                color = args[0].split("#").join("")
            } else {
                color = member.displayHexColor
            }
        }

        const embed = new MessageEmbed()
            .setTitle("#" + color)
            .setColor(color)
            .setFooter("bot.tekoh.wtf")
        
        if (member) {
            embed.setDescription(member.user.toString())
            embed.setTitle(member.displayHexColor)
        }

        message.channel.send(embed)

    }
}