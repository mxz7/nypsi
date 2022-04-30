const { Message, Permissions } = require("discord.js")
const { getPrefix } = require("../utils/guilds/utils")
const { getCase, setReason } = require("../utils/moderation/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("reason", "set a reason for a case/punishment", categories.MODERATION).setPermissions([
    "MANAGE_MESSAGES",
])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) return

    const prefix = getPrefix(message.guild)

    if (args.length <= 1) {
        const embed = new CustomEmbed(message.member)
            .setTitle("reason help")
            .addField("usage", `${prefix}reason <case ID> <new reason>`)
            .addField("help", "use this command to change the current reason for a punishment case")

        return await message.channel.send({ embeds: [embed] })
    }

    const caseID = args[0]

    args.shift()

    const reason = args.join(" ")

    const case0 = getCase(message.guild, caseID)

    if (!case0) {
        return message.channel.send({
            embeds: [new ErrorEmbed("couldn't find a case with the id `" + caseID + "`")],
        })
    }

    setReason(message.guild, caseID, reason)

    const embed = new CustomEmbed(message.member).setTitle("reason").setDescription("✅ case updated")

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
