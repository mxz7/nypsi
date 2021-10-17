const { Message, Permissions } = require("discord.js")
const { getSnipeFilter, updateFilter, getPrefix } = require("../utils/guilds/utils")
const { Command, categories } = require("../utils/classes/Command.js")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("snipefilter", "change the snipe filter for your server", categories.ADMIN)
    .setAliases(["sf"])
    .setPermissions(["MANAGE_SERVER"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_GUILD)) {
        if (message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) {
            return message.channel.send({ embeds: [new ErrorEmbed("you need the `manage server` permission")] })
        }
        return
    }

    let filter = getSnipeFilter(message.guild)

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member, false, "`" + filter.join("`\n`") + "`")
            .setTitle("current snipe filter")
            .setFooter(`use ${prefix}sf (add/del/+/-) to modify the filter`)

        if (filter.length == 0) {
            embed.setDescription("`❌` empty snipe filter")
        }

        return message.channel.send({ embeds: [embed] })
    }

    if (args[0].toLowerCase() == "add" || args[0].toLowerCase() == "+") {
        if (args.length == 1) {
            return message.channel.send({
                embeds: [new ErrorEmbed(`${prefix}sf add/+ <word> | cAsInG doesn't matter, it'll be filtered either way`)],
            })
        }

        const word = args[1]
            .toString()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[^A-z0-9\s]/g, "")

        if (word == "" || word == " ") {
            return message.channel.send({ embeds: [new ErrorEmbed("word must contain letters or numbers")] })
        }

        if (filter.indexOf(word) > -1) {
            const embed = new CustomEmbed(message.member, false, "❌ `" + word + "` already exists in the filter")
                .setTitle("snipe filter")
                .setFooter(`you can use ${prefix}sf to view the filter`)

            return message.channel.send({ embeds: [embed] })
        }

        filter.push(word)

        if (filter.join("").length > 1000) {
            filter.splice(filter.indexOf(word), 1)

            const embed = new CustomEmbed(
                message.member,
                true,
                `❌ filter has exceeded the maximum size - please use *${prefix}sf del/-* or *${prefix}sf reset*`
            ).setTitle("snipe filter")

            return message.channel.send({ embeds: [embed] })
        }

        updateFilter(message.guild, filter)

        const embed = new CustomEmbed(message.member, true, "✅ added `" + word + "` to the filter").setTitle("snipe filter")
        return message.channel.send({ embeds: [embed] })
    }

    if (args[0].toLowerCase() == "del" || args[0].toLowerCase() == "-") {
        if (args.length == 1) {
            return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}sf del/- <word>`)] })
        }

        let word = args[1]
            .toString()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[^A-z0-9\s]/g, "")

        if (filter.indexOf(word) > -1) {
            filter.splice(filter.indexOf(word), 1)
        } else {
            const embed = new CustomEmbed(message.member, false, "❌ `" + word + "` not found in the filter")
                .setTitle("snipe filter")
                .setFooter(`you can use ${prefix}sf to view the filter`)

            return message.channel.send({ embeds: [embed] })
        }

        updateFilter(message.guild, filter)

        const embed = new CustomEmbed(message.member, false, "✅ removed `" + word + "` from the filter")
            .setTitle("snipe filter")
            .setFooter(`you can use ${prefix}sf reset to reset the filter`)

        return message.channel.send({ embeds: [embed] })
    }

    if (args[0].toLowerCase() == "reset") {
        filter = ["discordgg", "discordcom"]

        updateFilter(message.guild, filter)

        const embed = new CustomEmbed(message.member, false, "✅ filter has been reset").setTitle("snipe filter")

        return message.channel.send({ embeds: [embed] })
    }
}

cmd.setRun(run)

module.exports = cmd
