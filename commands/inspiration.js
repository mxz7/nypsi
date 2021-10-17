const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { isPremium } = require("../utils/premium/utils")
const fetch = require("node-fetch")
const isImageUrl = require("is-image-url")

const cooldown = new Map()

const cmd = new Command("inspiration", "generate an inspirational quote (inspirobot.me)", categories.FUN).setAliases([
    "quote",
    "inspire",
])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let cooldownLength = 10

    if (isPremium(message.author.id)) {
        cooldownLength = 5
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
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    const res = await fetch("https://inspirobot.me/api?generate=true").then((res) => res.text())

    if (!isImageUrl(res)) {
        return message.channel.send({ embeds: [new ErrorEmbed("error fetching image")] })
    }

    return message.channel.send({ embeds: [new CustomEmbed(message.member, false).setImage(res)] })
}

cmd.setRun(run)

module.exports = cmd
