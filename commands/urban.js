const urban = require("relevant-urban")
const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getPrefix } = require("../guilds/utils")
const { isPremium } = require("../premium/utils")

const cooldown = new Map()

const cmd = new Command(
    "urban",
    "get a definition from urban dictionary",
    categories.INFO
).setAliases(["define"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let cooldownLength = 5

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

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        return message.channel.send(new ErrorEmbed(`${prefix}urban <definition>`))
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    const result = await urban(args.join()).catch(() => {
        return message.channel.send(new ErrorEmbed("unknown definition"))
    })

    if (!result.word) return

    const embed = new CustomEmbed(
        message.member,
        false,
        result.definition + "\n\n" + result.example
    )
        .setTitle(result.word)
        .setHeader("published by " + result.author)
        .addField("👍", result.thumbsUp.toLocaleString(), true)
        .addField("👎", result.thumbsDown.toLocaleString(), true)
        .setURL(result.urbanURL)

    message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd
