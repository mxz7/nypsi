const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("esnipe", "snipe the most recently edited message", categories.FUN).setAliases(["es"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    const { eSnipe } = require("../nypsi.js")

    let channel = message.channel

    if (args.length == 1) {
        if (!message.mentions.channels.first()) {
            return message.channel.send(new ErrorEmbed("invalid channel"))
        }
        channel = message.mentions.channels.first()
        if (!channel) {
            return message.channel.send(new ErrorEmbed("invalid channel"))
        }
    }

    if (!eSnipe || !eSnipe.get(channel.id)) {
        return message.channel.send(new ErrorEmbed("nothing to edit snipe in " + channel.toString()))
    }

    let content = eSnipe.get(channel.id).content

    if (content) {
        if (eSnipe.get(channel.id).attachments.url) {
            content = eSnipe.get(channel).attachments.url
        }
    }

    if (content.split("\n").length > 10) {
        content = content.split("\n").join(".")
    }

    const created = new Date(eSnipe.get(channel.id).createdTimestamp)

    const embed = new CustomEmbed(message.member, false, content)
        .setTitle(eSnipe.get(channel.id).member.user.tag)
        .setFooter(timeSince(created) + " ago")
    
    message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd

function timeSince(date) {

    const ms = Math.floor((new Date() - date))

    const days = Math.floor(ms / (24 * 60 * 60 * 1000))
    const daysms = ms % (24 * 60 * 60 * 1000)
    const hours = Math.floor((daysms) / (60*60*1000))
    const hoursms = ms % (60 * 60 * 1000)
    const minutes = Math.floor((hoursms) / (60 * 1000))
    const minutesms = ms % (60 * 1000)
    const sec = Math.floor((minutesms) / (1000))

    let output = ""

    if (days > 0) {
        output = output + days + "d "
    }

    if (hours > 0) {
        output = output + hours + "h "
    }

    if (minutes > 0) {
        output = output + minutes + "m "
    }

    if (sec > 0) {
        output = output + sec + "s"
    }

    if (output == "") {
        output = "0s"
    }

    return output
}