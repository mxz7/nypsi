const { Message } = require("discord.js")
const { Command, categories } = require("../utils/models/Command")
const { toggleLock } = require("../utils/utils")

const cmd = new Command("captchatest", "test an account", categories.NONE)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (message.author.id != "672793821850894347") return

    if (args.length == 0 || args[0].length != 18) {
        return message.channel.send({ content: "dumbass" })
    }

    for (const user of args) {
        toggleLock(user)
    }

    message.react("✅")
}

cmd.setRun(run)

module.exports = cmd
