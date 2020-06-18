const { getColor } = require("../utils/utils")
const { MessageEmbed } = require("discord.js")

module.exports = {
    name: "roll",
    description: "roll a dice",
    category: "fun",
    run: async (message, args) => {

        let range = 6

        if (args.length != 0) {
            if (parseInt(args[0])) {
                range = parseInt(args[0])
            }
        }

        const color = getColor(message.member)

        const embed = new MessageEmbed()
            .setDescription("🎲 you rolled a **" + (Math.floor(Math.random() * range) + 1) + "**")
            .setColor(color)

        return message.channel.send(embed)
    }
};