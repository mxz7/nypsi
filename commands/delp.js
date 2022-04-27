const { Message, Collection } = require("discord.js")
const { isPremium, getTier } = require("../utils/premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed } = require("../utils/classes/EmbedBuilders.js")

const cooldown = new Map()

const cmd = new Command("delp", "bulk delete/purge your own messages", categories.MODERATION).setAliases(["dp", "d"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message) {
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

    let amount = 7

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
            amount = 100
        } else {
            amount = 50
        }
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    let collected

    if (amount == 7) {
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

    await message.channel.bulkDelete(collected).catch(() => {})
}

cmd.setRun(run)

module.exports = cmd
