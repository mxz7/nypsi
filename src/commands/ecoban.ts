const { Message } = require("discord.js")
const { Command, Categories } = require("../utils/models/Command")
const { toggleBan } = require("../utils/economy/utils")

const cmd = new Command("ecoban", "ban an account from eco", Categories.NONE)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (message.author.id != "672793821850894347") return

    if (args.length == 0 || args[0].length != 18) {
        return message.channel.send({ content: "dumbass" })
    }

    toggleBan(args[0])

    message.react("✅")
}

cmd.setRun(run)

module.exports = cmd
