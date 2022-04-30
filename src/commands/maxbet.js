const { Message } = require("discord.js")
const { calcMaxBet, userExists, createUser } = require("../utils/economy/utils.js")
const { Command, categories } = require("../utils/models/Command")
const { CustomEmbed, ErrorEmbed } = require("../utils/models/EmbedBuilders")

const cooldown = new Map()

const cmd = new Command("maxbet", "calculate your maximum bet", categories.MONEY)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message) {
    if (!userExists(message.member)) createUser(message.member)

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 5 - diff

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
    }, 5000)

    const maxBet = await calcMaxBet(message.member)

    return message.channel.send({
        embeds: [new CustomEmbed(message.member, false, `your maximum bet is $**${maxBet.toLocaleString()}**`)],
    })
}

cmd.setRun(run)

module.exports = cmd
