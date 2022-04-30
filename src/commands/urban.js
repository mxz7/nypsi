const urban = require("urban-dictionary")
const { Message } = require("discord.js")
const { Command, categories } = require("../utils/models/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders.js")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium } = require("../utils/premium/utils")
const { inPlaceSort } = require("fast-sort")

const cooldown = new Map()

const cmd = new Command("urban", "get a definition from urban dictionary", categories.INFO).setAliases(["define"])

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
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}urban <definition>`)] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    const results = await urban.define(args.join()).catch(() => {
        return message.channel.send({ embeds: [new ErrorEmbed("unknown definition")] })
    })

    inPlaceSort(results).desc((i) => i.thumbs_up)

    const result = results[0]

    if (!result) return
    if (!result.word) return

    const embed = new CustomEmbed(message.member, false, result.definition + "\n\n" + result.example)
        .setTitle(result.word)
        .setHeader("published by " + result.author)
        .addField("👍", result.thumbs_up.toLocaleString(), true)
        .addField("👎", result.thumbs_down.toLocaleString(), true)
        .setURL(result.permalink)

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
