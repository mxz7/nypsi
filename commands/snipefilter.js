const { Message } = require("discord.js")
const { getSnipeFilter, updateFilter, getPrefix } = require("../guilds/utils.js")
const { Command, categories } = require("../utils/classes/Command.js")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("snipefilter", "change the snipe filter for your server", categories.MODERATION).setAliases(["sf", "filter"]).setPermissions(["MANAGE_SERVER"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (!message.member.hasPermission("MANAGE_GUILD")) {
        if (message.member.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send(new ErrorEmbed("you need the `manage server` permission"))
        }
        return
    }

    let filter = getSnipeFilter(message.guild)

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member, false, "`" + filter.join("`\n`") + "`")
            .setTitle("current snipe filter")
            .setFooter(`use ${prefix}sf (add/del/+/-) to modify the filter`)
        
        return message.channel.send(embed)
    }

    if (args[0].toLowerCase() == "add" || args[0].toLowerCase() == "+") {
        if (args.length == 1) {
            return message.channel.send(new ErrorEmbed(`${prefix}sf add/+ <word> | cAsInG doesn't matter, it'll be filtered either way`))
        }

        if (filter.indexOf(args[1].toString().toLowerCase()) > -1) {
            const embed = new CustomEmbed(message.member, false, "❌ `" + args[1] + "` already exists in the filter")
                .setTitle("snipe filter")
                .setFooter(`you can use ${prefix}sf to view the filter`)

            return message.channel.send(embed)
        }

        filter.push(args[1].toString())

        if (filter.join("").length > 1000) {

            filter.splice(filter.indexOf(args[1].toString()), 1)

            const embed = new CustomEmbed(message.member, true, `❌ filter has exceeded the maximum size - please use *${prefix}sf del/-* or *${prefix}sf reset*`)
                .setTitle("snipe filter")

            return message.channel.send(embed)
        }

        updateFilter(message.guild, filter)

        const embed = new CustomEmbed(message.member, true, "✅ added `" + args[1] + "` to the filter")
            .setTitle("snipe filter")
        return message.channel.send(embed)
    }

    if (args[0].toLowerCase() == "del" || args[0].toLowerCase() == "-") {
        if (args.length == 1) {
            return message.channel.send(new ErrorEmbed(`${prefix}sf del/- <word>`))
        }

        if (filter.indexOf(args[1].toString()) > -1) {
            filter.splice(filter.indexOf(args[1].toString()), 1)
        } else {
            const embed = new CustomEmbed(message.member, false, "❌ `" + args[1] + "` not found in the filter")
                .setTitle("snipe filter")
                .setFooter(`you can use ${prefix}sf to view the filter`)

            return message.channel.send(embed)
        }

        updateFilter(message.guild, filter)

        const embed = new CustomEmbed(message.member, false, "✅ removed `" + args[1] + "` from the filter")
            .setTitle("snipe filter")
            .setFooter(`you can use ${prefix}sf reset to reset the filter`)

        return message.channel.send(embed)
    }

    if (args[0].toLowerCase() == "reset") {
        filter = ["discord.gg", "/invite/"]

        updateFilter(message.guild, filter)

        const embed = new CustomEmbed(message.member, false, "✅ filter has been reset")
            .setTitle("snipe filter")

        return message.channel.send(embed)
    }

}

cmd.setRun(run)

module.exports = cmd