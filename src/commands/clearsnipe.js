const { Message, Permissions } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("clearsnipe", "delete the current sniped thing", categories.MODERATION)
    .setAliases(["cs"])
    .setPermissions(["MANAGE_MESSAGES"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) return
    const { snipe, eSnipe } = require("../nypsi.js")

    let channel = message.channel

    if (args.length == 1) {
        if (!message.mentions.channels.first()) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] })
        }
        channel = message.mentions.channels.first()
        if (!channel) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] })
        }
    }

    if (!snipe || (!snipe.get(channel.id) && (!eSnipe || !eSnipe.get(channel.id)))) {
        return message.channel.send({
            embeds: [new ErrorEmbed("nothing has been sniped in " + channel.toString())],
        })
    }

    snipe.delete(channel.id)
    eSnipe.delete(channel.id)

    return message.channel.send({
        embeds: [new CustomEmbed(message.member, false, "✅ snipe cleared in " + channel.toString())],
    })
}

cmd.setRun(run)

module.exports = cmd
