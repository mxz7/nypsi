const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed } = require("../utils/classes/EmbedBuilders")

const cmd = new Command("servericon", "get the server icon", categories.INFO)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message) {
    return message.channel.send({
        embeds: [
            new CustomEmbed(message.member, false).setImage(
                message.guild.iconURL({
                    size: 256,
                    dynamic: true,
                })
            ),
        ],
    })
}

cmd.setRun(run)

module.exports = cmd
