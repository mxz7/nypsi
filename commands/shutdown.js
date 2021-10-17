const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { startRestart } = require("../utils/commandhandler")
const { info } = require("../utils/logger")

const cmd = new Command("shutdown", "shutdown bot", categories.NONE).setPermissions(["bot owner"])

let confirm = false

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (message.member.user.id != "672793821850894347") return

    if (confirm == false) {
        confirm = true
        setTimeout(() => {
            confirm = false
        }, 120000)
        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, "run command again to confirm")]
        })
    } else {
        startRestart()

        info("nypsi shutting down in 60 seconds...")

        setTimeout(() => {
            info("nypsi shutting down...")
            process.exit()
        }, 60000)

        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, "✅ bot will shut down in 60 seconds")]
        })
    }
}

cmd.setRun(run)

module.exports = cmd
