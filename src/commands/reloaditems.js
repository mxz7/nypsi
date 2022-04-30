const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { loadItems } = require("../utils/economy/utils")

const cmd = new Command("reloaditems", "reload items", categories.NONE).setPermissions(["bot owner"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message) {
    if (message.member.user.id != "672793821850894347") return

    const d = loadItems()

    return message.channel.send({ embeds: [new CustomEmbed(message.member, false, d)] })
}

cmd.setRun(run)

module.exports = cmd
