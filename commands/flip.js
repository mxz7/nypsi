const { getColor } = require("../utils/utils")
const { MessageEmbed, Message } = require("discord.js");
const { Command, categories } = require("../utils/classes/Command");

const cmd = new Command("flip", "flip a coin", categories.FUN)

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    const headTails = ["heads", "tails"];

    const answer = headTails[Math.floor(Math.random() * headTails.length)]

    const color = getColor(message.member)

    const embed = new MessageEmbed()
        .setColor(color)
        .setDescription("💸 you threw **" + answer + "**")

    return message.channel.send(embed)

}

cmd.setRun(run)

module.exports = cmd