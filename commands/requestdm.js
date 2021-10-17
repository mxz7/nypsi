const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed } = require("../utils/classes/EmbedBuilders")

const cmd = new Command(
    "requestdm",
    "attempt to send a DM to a given user (this is my way of having fun leave me alone)",
    categories.NONE
)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (message.author.id != "672793821850894347") return

    if (args.length < 2) {
        return message.channel.send({ embeds: [new ErrorEmbed("$requestdm <id> <content>")] })
    }

    const { requestDM } = require("../nypsi")

    const user = args[0]

    args.shift()

    const a = await requestDM(user, args.join(" "))

    if (a) {
        message.react("✅")
    } else {
        message.react("❌")
    }
}

cmd.setRun(run)

module.exports = cmd
