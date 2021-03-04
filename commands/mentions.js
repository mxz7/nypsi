const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")

const cooldown = new Map()

const cmd = new Command("mentions", "view who mentioned you recently", categories.INFO).setAliases(["pings", "whothefuckpingedme"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 15 - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``))
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 15000)

    const { mentions } = require("../nypsi.js")

    if (!mentions.get(message.guild.id)) {
        return message.channel.send(new CustomEmbed(message.member, false, "no recent mentions"))
    }

    if (!mentions.get(message.guild.id).get(message.author.id)) {
        return message.channel.send(new CustomEmbed(message.member, false, "no recent mentions"))
    }

    const userMentions = mentions.get(message.guild.id).get(message.author.id)

    if (userMentions.length == 0) {
        return message.channel.send(new CustomEmbed(message.member, false, "no recent mentions"))
    }

    userMentions.reverse()

    const embed = new CustomEmbed(message.member, false).setTitle("recent mentions")

    for (let i of userMentions) {
        embed.addField(`${timeSince(i.date)} ago`, `**${i.user}**: ${i.content}\n[jump](${i.link})`)
    }

    userMentions.reverse()

    return message.channel.send(embed)
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
    } else if (output != "") {
        output = output.substr(0, output.length - 1)
    }

    if (output == "") {
        output = "0s"
    }

    return output
}