const { bottomAmount } = require("../utils/economy/utils.js")
const { Message, Permissions } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cooldown = new Map()

const cmd = new Command("balbottom", "view bottom balances in the server", categories.MONEY).setAliases([
    "bottom",
    "brokeboys",
])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 10 - diff

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
    }, 10000)

    let amount

    if (args.length == 0) {
        args[0] = 5
    }

    if (isNaN(args[0]) || parseInt(args[0]) <= 0) {
        args[0] = 5
    }

    amount = parseInt(args[0])

    let min = 1

    if (parseInt(args[1])) min = parseInt(args[1])

    if (amount > 10 && !message.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) amount = 10

    if (amount < 5) amount = 5

    const balBottom = await bottomAmount(message.guild, amount, min)

    let filtered = balBottom.filter(function (el) {
        return el != null
    })

    if (filtered.length == 0) {
        return await message.channel.send({
            embeds: [new CustomEmbed(message.member, false, "no members to show")],
        })
    }

    const embed = new CustomEmbed(message.member, false)
        .setTitle("bottom " + filtered.length)
        .setDescription(filtered.join("\n"))

    message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
