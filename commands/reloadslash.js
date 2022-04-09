const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { uploadGuildCommands } = require("../utils/commandhandler")

const cmd = new Command("reloadslash", "reload data for slash commands", categories.NONE).setPermissions(["bot owner"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (message.member.user.id != "672793821850894347") return

    uploadGuildCommands(message.guild.id, message.client.user.id)
}

cmd.setRun(run)

module.exports = cmd