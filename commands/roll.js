const { getColor } = require("../utils/utils")
const { MessageEmbed, Message } = require("discord.js");
const { Command, categories } = require("../utils/classes/Command");

const cmd = new Command("roll", "roll a dice", categories.FUN)

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    let range = 6

    if (args.length != 0) {
        if (parseInt(args[0])) {
            if (parseInt(args[0]) < 2) {
                return message.channel.send("❌ invalid range")
            } else {
                range = parseInt(args[0])
            }
        }
    }

    const color = getColor(message.member)

    const embed = new MessageEmbed()
        .setDescription("🎲 you rolled a **" + (Math.floor(Math.random() * range) + 1) + "**")
        .setColor(color)

    return message.channel.send(embed)

}

cmd.setRun(run)

module.exports = cmd