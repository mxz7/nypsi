const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed, ErrorEmbed } = require("../utils/classes/EmbedBuilders")
const { formatDate } = require("../utils/utils")

const cmd = new Command("changelog", "create a changelog message", categories.NONE).setPermissions(["bot owner"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (message.member.user.id != "672793821850894347") return

    if (args.length == 0) {
        return message.channel.send({embeds: [new ErrorEmbed("dumbass")]})
    }

    const embed = new CustomEmbed().setColor("#111111").setTitle(formatDate(new Date())).setTimestamp().setDescription(args.join(" "))

    await message.delete()

    return message.channel.send({embeds: [embed]})
}

cmd.setRun(run)

module.exports = cmd
