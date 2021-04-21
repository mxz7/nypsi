const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { isPremium } = require("../utils/premium/utils")
const { getMember } = require("../utils/utils")
const roasts = require("../lists.json").roasts

const cmd = new Command("roast", "roast people since you cant do it yourself", categories.FUN)

const cooldown = new Map()

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let cooldownLength = 7

    if (isPremium(message.author.id)) {
        cooldownLength = 1
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = cooldownLength - diff

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

    if (args.length == 0) {
        return message.channel.send(new ErrorEmbed("who do u want me to roast bro"))
    }

    let target

    if (!message.mentions.members.first()) {
        target = await getMember(message, args.join(" "))
    } else {
        target = message.mentions.members.first()
    }

    if (!target) {
        return message.channel.send(new ErrorEmbed("invalid user"))
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    const roastIndex = Math.floor(Math.random() * roasts.length)

    const roast = roasts[roastIndex]
        .replace("%t", target.user.toString())
        .replace("%m", message.author.toString())

    return message.channel.send(
        new CustomEmbed(message.member, false, roast).setFooter(`roast #${roastIndex}`)
    )
}

cmd.setRun(run)

module.exports = cmd
