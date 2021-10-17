const { userExists, updateBalance, getBalance, createUser } = require("../utils/economy/utils.js")
const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command.js")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { isPremium, getTier } = require("../utils/premium/utils")

const cooldown = new Map()

const cmd = new Command("freemoney", "get $1k every 5 minutes", categories.MONEY).setAliases(["poor", "imbroke"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 300 - diff

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

    if (!userExists(message.member)) createUser(message.member)

    if (getBalance(message.member) > 500000) {
        return message.channel.send({ embeds: [new ErrorEmbed("you're too rich for this command bro")] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 300000)

    let amount = 1000

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 1) {
            amount = 2500
        } else if (getTier(message.author.id) == 2) {
            amount = 5000
        } else if (getTier(message.author.id) == 3) {
            amount = 7500
        } else if (getTier(message.author.id) == 4) {
            amount = 10000
        }
    }

    updateBalance(message.member, getBalance(message.member) + amount)

    const embed = new CustomEmbed(message.member, false, `+$**${amount.toLocaleString()}**`).setTitle(
        "freemoney | " + message.member.user.username
    )

    message.channel.send({ embeds: [embed] }).then((msg) => {
        embed.setDescription(
            `+$**${amount.toLocaleString()}**\nnew balance: $**${getBalance(message.member).toLocaleString()}**`
        )
        setTimeout(() => {
            msg.edit({ embeds: [embed] })
        }, 1000)
    })
}

cmd.setRun(run)

module.exports = cmd
