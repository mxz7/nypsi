const { Message } = require("discord.js")
const { getPrefix } = require("../utils/guilds/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")

const cmd = new Command("enlarge", "enlarge a custom emoji to its full size", categories.UTILITY).setAliases([
    "emoji",
    "makebig",
])

const cooldown = new Map()

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 3 - diff

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

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        return message.channel.send({
            embeds: [new ErrorEmbed(`${prefix}enlarge <emoji>`).setTitle("`❌` usage")],
        })
    }

    let emoji = args[0]

    emoji = emoji.split(":")

    if (!emoji[2]) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid emoji - please use a custom emoji")] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 3000)

    const emojiID = emoji[2].slice(0, emoji[2].length - 1)

    let url = `https://cdn.discordapp.com/emojis/${emojiID}`

    if (emoji[0].includes("a")) {
        url = url + ".gif"
    } else {
        url = url + ".png"
    }

    return message.channel.send({
        embeds: [new CustomEmbed(message.member).setImage(url).setFooter(`id: ${emojiID}`)],
    })
}

cmd.setRun(run)

module.exports = cmd
