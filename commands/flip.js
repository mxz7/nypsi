const { getColor } = require("../utils/utils")
const { MessageEmbed, Message } = require("discord.js");

module.exports = {
    name: "flip",
    description: "flip a coin",
    category: "fun",
    /**
     * @param {Message} message 
     * @param {Array} args 
     */
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