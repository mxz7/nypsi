const { Message, Collection } = require("discord.js")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium, getTier } = require("../utils/premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed } = require("../utils/classes/EmbedBuilders.js")

const cooldown = new Map()

const cmd = new Command("delp", "bulk delete/purge your own messages", categories.MODERATION).setAliases(["dp"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let cooldownLength = 30

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
            cooldownLength = 10
        }
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

    if (args.length == 0) {
        args[0] = 5
        if (isPremium(message.author.id)) {
            if (getTier(message.author.id) == 4) {
                args[0] = 100
            }
        }
    }

    const prefix = getPrefix(message.guild)

    if (isNaN(args[0]) || parseInt(args[0]) <= 0) {
        return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}delp <amount>`)] })
    }

    let amount = parseInt(args[0])

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    if (amount > 100) amount = 100

    if (!isPremium(message.author.id)) {
        if (amount > 20) {
            amount = 20
        }
    }

    let collected

    if (amount <= 6) {
        collected = await message.channel.messages.fetch({ limit: 25 })
    } else {
        collected = await message.channel.messages.fetch({ limit: 100 })
    }

    collected = collected.filter((msg) => {
        if (!msg.author) return
        return msg.author.id == message.author.id
    })

    if (collected.size == 0) {
        return
    }

    if (collected.size > amount) {
        const collectedValues = Array.from(collected.values())

        collectedValues.splice(amount + 1, collectedValues.length)

        collected = new Collection()

        for (const msg of collectedValues) {
            collected.set(msg.id, msg)
        }
    }

    await message.channel.bulkDelete(collected)
}

cmd.setRun(run)

module.exports = cmd
