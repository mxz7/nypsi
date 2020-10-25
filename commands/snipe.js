const { Message } = require("discord.js");
const { Command, categories } = require("../utils/classes/Command");
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("snipe", "snipe the most recently deleted message", categories.FUN).setAliases(["s"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    const { snipe } = require("../nypsi.js")

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

    if (!snipe || !snipe.get(channel.id)) {
        return message.channel.send(new ErrorEmbed("nothing to snipe in " + channel.toString()))
    }

    let content = snipe.get(channel.id).content

    if (content) {
        if (snipe.get(channel.id).attachments.url) {
            content = snipe.get(channel).attachments.url
        }
    }

    if (content.split("\n").length > 10) {
        content = content.split("\n").join(".")
    }

    const created = new Date(snipe.get(channel.id).createdTimestamp)

    const embed = new CustomEmbed(message.member, false, content)
        .setTitle(snipe.get(channel.id).author.tag)
        .setFooter(timeSince(created) + " ago")
    
    message.channel.send(embed)

}

cmd.setRun(run)

module.exports = cmd

function timeSince(date) {

    const ms = Math.floor((new Date() - date));

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