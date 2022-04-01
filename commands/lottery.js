const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const {
    getTickets,
    lotteryTicketPrice,
    userExists,
    createUser,
    getPrestige,
    getBalance,
    updateBalance,
    addTicket,
} = require("../utils/economy/utils")
const { getPrefix } = require("../utils/guilds/utils")
const { getKarma } = require("../utils/karma/utils")
const { isPremium, getTier } = require("../utils/premium/utils")

const cmd = new Command("lottery", "enter the weekly lottery draw", categories.MONEY).setAliases(["lotto"])

const cooldown = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!userExists(message.member)) createUser(message.member)

    const tickets = getTickets(message.member)

    const prestigeBonus = Math.floor((getPrestige(message.member) > 20 ? 20 : getPrestige(message.member)) / 2.5)
    const premiumBonus = Math.floor(isPremium(message.member) ? getTier(message.member) : 0)
    const karmaBonus = Math.floor(getKarma(message.member) / 100)

    const max = 5 + prestigeBonus + premiumBonus + karmaBonus

    const help = () => {
        const embed = new CustomEmbed(message.member, false)

        embed.setTitle("lottery")
        embed.setDescription(
            "nypsi lottery is a weekly draw which happens in the [official nypsi server](https://discord.gg/hJTDNST) every saturday at 12am (utc)\n\n" +
                `you can buy lottery tickets for $**${lotteryTicketPrice.toLocaleString()}** with ${getPrefix(
                    message.guild
                )}**lotto buy**\nyou can have a maximum of **${max}** tickets`
        )

        if (tickets.length > 0) {
            const t = []

            for (const ticket of tickets) {
                t.push(`**#${ticket.id}**`)
            }

            embed.addField(`your tickets [${tickets.length}]`, t.join("\n"))
        }

        return message.channel.send({ embeds: [embed] })
    }

    if (args.length == 0) {
        return help()
    } else if (args[0].toLowerCase() == "buy" || args[0].toLowerCase() == "b") {
        let cooldownLength = 10

        if (isPremium(message.author.id)) {
            cooldownLength = 2
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

        let amount = 1

        if (args.length == 1) {
            return message.channel.send({ embeds: [new CustomEmbed(message.member, false, "😐")]})
        }

        if (parseInt(args[1])) {
            amount = parseInt(args[1])
        } else if (args[1].toLowerCase() == "all" || args[1].toLowerCase() == "max") {
            amount = max
        } else {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] })
        }

        if (amount < 1) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] })
        }

        if (tickets.length + amount > max) {
            amount = max - tickets.length
        }

        if (tickets.length >= max) {
            return message.channel.send({ embeds: [new ErrorEmbed(`you can only have ${max} tickets at a time`)] })
        }

        if (getBalance(message.member) < lotteryTicketPrice * amount) {
            return message.channel.send({
                embeds: [new ErrorEmbed("you cannot afford this")],
            })
        }

        cooldown.set(message.member.id, new Date())

        setTimeout(() => {
            cooldown.delete(message.author.id)
        }, cooldownLength * 1000)

        updateBalance(message.member, getBalance(message.member) - lotteryTicketPrice * amount)

        for (let i = 0; i < amount; i++) {
            addTicket(message.member)
        }

        const embed = new CustomEmbed(
            message.member,
            false,
            `you have bought **${amount}** lottery ticket${amount > 1 ? "s" : ""} for $**${(
                lotteryTicketPrice * amount
            ).toLocaleString()}**`
        )

        return message.channel.send({ embeds: [embed] })
    } else {
        return help()
    }
}

cmd.setRun(run)

module.exports = cmd
