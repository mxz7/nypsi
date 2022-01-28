const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const fs = require("fs")

const cmd = new Command("mqueue", "admin command", categories.ADMIN)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (message.author.id != "672793821850894347") return

    const { mentionQueue } = require("../utils/users/utils")

    if (args.length == 0) {
        fs.writeFileSync("./queue.txt", mentionQueue.toString(), () => {})
    }
}

cmd.setRun(run)

module.exports = cmd
