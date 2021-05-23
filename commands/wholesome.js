const { Message } = require("discord.js")
const { isPremium } = require("../utils/premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getWholesomeImage, suggestWholesomeImage } = require("../utils/utils")
const { getPrefix } = require("../utils/guilds/utils")

const cooldown = new Map()

const cmd = new Command("wholesome", "get a random wholesome picture", categories.FUN).setAliases([
    "iloveyou",
    "loveyou",
    "loveu",
])

/**
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

    const embed = new CustomEmbed(message.member)

    if (args.length == 0) {
        const image = getWholesomeImage()

        embed.setHeader(`<3 | ${image.id}`)
        embed.setImage(image.image)
    } else if (args[0].toLowerCase() == "add" || args[0].toLowerCase() == "suggest" || args[0].toLowerCase() == "+") {
        if (args.length == 1) {
            return message.channel.send(new ErrorEmbed(`${getPrefix(message.guild)}wholesome suggest <imgur url>`))
        }

        const url = args[1].toLowerCase()

        if (!url.startsWith("https://i.imgur.com/")) {
            return message.channel.send(new ErrorEmbed("must be an image hosted on https://imgur.com\n\ntutorial: https://youtu.be/xaRu40hawUE"))
        }

        const res = await suggestWholesomeImage(message.member, url)

        if (!res) {
            return message.channel.send(new ErrorEmbed(`error: maybe that image already exists? if this persists join the ${getPrefix(message.guild)}support server`))
        }

        return message.react("✅")
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    return message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd
