const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed } = require("../utils/classes/EmbedBuilders")

const cmd = new Command("evaluate", "evaluate code", categories.NONE).setAliases(["eval"]).setPermissions(["bot owner"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {
    if (message.author.id != "672793821850894347") return

    const res = await eval("(async () => {" + args.join(" ") + "})()")

    const embed = new CustomEmbed(message.member, false, `\`\`\`js\n${res}\`\`\``)

    return message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd