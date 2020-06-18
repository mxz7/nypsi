const { getColor } = require("../utils/utils")
const { MessageEmbed } = require("discord.js")

module.exports = {
    name: "flip",
    description: "flip a coin",
    category: "fun",
    run: async (message, args) => {
        const headTails = ["heads", "tails"];

        const answer = headTails[Math.floor(Math.random() * headTails.length)]

        const color = getColor(message.member)

        const embed = new MessageEmbed()
            .setColor(color)
            .setDescription("💸 you threw **" + answer + "**")

        return message.channel.send(embed)
    }
};