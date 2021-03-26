const { Message } = require("discord.js")
const { getPrefix } = require("../guilds/utils")
const { isPremium, getTier } = require("../premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed } = require("../utils/classes/EmbedBuilders.js")

const cooldown = new Map()

const cmd = new Command(
    "delp",
    "bulk delete/purge your own messages",
    categories.MODERATION
).setAliases(["dp"])

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

        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``))
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
        return message.channel.send(new ErrorEmbed(`${prefix}delp <amount>`))
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

    const collecteda = collected.filter((msg) => {
        if (!msg.author) return
        return msg.author.id == message.author.id
    })

    if (collecteda.size == 0) {
        return
    }

    let count = 0

    for (let msg of collecteda.array()) {
        if (count >= amount) {
            await collecteda.delete(msg.id)
        } else {
            count++
        }
    }

    await message.channel.bulkDelete(collecteda)
}

cmd.setRun(run)

module.exports = cmd
