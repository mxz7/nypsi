const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { info } = require("../utils/logger")

const cmd = new Command("reload", "reload commands", categories.NONE).setPermissions(["bot owner"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (message.member.user.id != "672793821850894347") return
    const { loadCommands, reloadCommand } = require("../utils/commandhandler")

    if (args.length == 0) {
        loadCommands()
        message.react("✅")
        info("commands reloaded")
    } else {
        let msg

        try {
            msg = reloadCommand(args).split("✔")
            msg = "```\n" + msg + "```"
        } catch (e) {
            return message.channel.send({ embeds: [new ErrorEmbed(`\`\`\`${e}\`\`\``)] })
        }

        const embed = new CustomEmbed(message.member, false, msg).setTitle("reload")

        message.channel.send({ embeds: [embed] })
    }
}

cmd.setRun(run)

module.exports = cmd
