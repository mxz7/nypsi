const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("roll", "roll a dice", categories.UTILITY)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let range = 6

    if (args.length != 0) {
        if (parseInt(args[0])) {
            if (parseInt(args[0]) < 2 || parseInt(args[0]) > 1000000000) {
                return message.channel.send({ embeds: [new ErrorEmbed("invalid range")] })
            } else {
                range = parseInt(args[0])
            }
        }
    }

    return message.channel.send({
        embeds: [
            new CustomEmbed(
                message.member,
                false,
                "🎲 you rolled `" + (Math.floor(Math.random() * range) + 1).toLocaleString() + "`"
            ),
        ],
    })
}

cmd.setRun(run)

module.exports = cmd
