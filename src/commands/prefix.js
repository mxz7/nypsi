const { Message, Permissions } = require("discord.js")
const { getPrefix, setPrefix } = require("../utils/guilds/utils")
const { Command, Categories } = require("../utils/models/Command")
const { CustomEmbed, ErrorEmbed } = require("../utils/models/EmbedBuilders")

const cmd = new Command("prefix", "change the bot's prefix", Categories.ADMIN).setPermissions(["MANAGE_GUILD"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    const prefix = getPrefix(message.guild)

    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_GUILD)) {
        if (message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) {
            return message.channel.send({ embeds: [new ErrorEmbed("you need the `manage server` permission")] })
        }
        return
    }

    if (args.length == 0) {
        const embed = new CustomEmbed(
            message.member,
            false,
            "current prefix: `" + prefix + "`\n\nuse " + prefix + "**prefix** <new prefix> to change the current prefix"
        ).setTitle("prefix")

        return message.channel.send({ embeds: [embed] })
    }

    if (args.join(" ").length > 3) {
        return message.channel.send({ embeds: [new ErrorEmbed("prefix cannot be longer than 3 characters")] })
    }

    setPrefix(message.guild, args.join(" "))

    const embed = new CustomEmbed(message.member, false, "✅ prefix changed to `" + args.join(" ") + "`").setTitle("prefix")

    return await message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
