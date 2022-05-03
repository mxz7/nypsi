import {
    getBalance,
    createUser,
    updateBalance,
    userExists,
    formatBet,
    calcMaxBet,
    isEcoBanned,
    addGamble,
} from "../utils/economy/utils.js"
import { CommandInteraction, Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
import { getPrefix } from "../utils/guilds/utils"
import { getExactMember } from "../utils/utils.js"
import { isPremium, getTier } from "../utils/premium/utils"
import { gamble } from "../utils/logger.js"

const cooldown = new Map()

const waiting = []

const cmd = new Command("coinflip", "flip a coin, double or nothing", Categories.MONEY).setAliases(["cf"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (!userExists(message.member)) {
        createUser(message.member)
    }

    let cooldownLength = 10

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
            cooldownLength = 3
        } else {
            cooldownLength = 6
        }
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr.getTime() - init) / 1000)
        const time = cooldownLength - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining: string

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    const prefix = getPrefix(message.guild)

    if (args.length != 2) {
        const embed = new CustomEmbed(message.member, false)
            .setTitle("coinflip help")
            .addField("usage", `${prefix}coinflip @user <bet>`)
            .addField("help", "if you win, you will double your bet")
            .addField("example", `${prefix}coinflip @user 100`)

        return message.channel.send({ embeds: [embed] })
    }

    if (waiting.includes(message.author.id)) {
        return message.channel.send({
            embeds: [new ErrorEmbed("please wait until your game has been accepted or denied")],
        })
    }

    if (args[0].toLowerCase() == "t") args[0] = "tails"

    if (args[0].toLowerCase() == "h") args[0] = "heads"

    let target

    if (!message.mentions.members.first()) {
        target = await getExactMember(message.guild, args[0])
    } else {
        target = message.mentions.members.first()
    }

    if (!target) {
        return message.channel.send({ embeds: [new ErrorEmbed("unable to find that member")] })
    }

    if (message.member == target) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] })
    }

    if (target.user.bot) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] })
    }

    if (isEcoBanned(target.user.id)) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] })
    }

    const maxBet = calcMaxBet(message.member)

    if (args[0].toLowerCase() == "all") {
        args[0] = getBalance(message.member).toString()
        if (getBalance(message.member) > maxBet) {
            args[0] = maxBet.toString()
        }
    }

    if (args[0] == "half") {
        args[0] = (getBalance(message.member) / 2).toString()
    }

    if (parseInt(args[0])) {
        args[0] = formatBet(args[0]).toString()
    } else {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid bet")] })
    }

    const bet = parseInt(args[1])

    if (!bet) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid bet")] })
    }

    if (bet <= 0) {
        return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}coinflip @user 100`)] })
    }

    if (bet > getBalance(message.member)) {
        return message.channel.send({ embeds: [new ErrorEmbed("you cannot afford this bet")] })
    }

    if (bet > getBalance(target)) {
        return message.channel.send({ embeds: [new ErrorEmbed(`**${target.user.tag}** cannot afford this bet`)] })
    }

    const targetMaxBet = calcMaxBet(target)

    if (bet > maxBet) {
        return message.channel.send({
            embeds: [
                new ErrorEmbed(
                    `your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`
                ),
            ],
        })
    }

    if (bet > targetMaxBet) {
        return message.channel.send({
            embeds: [new ErrorEmbed(`**${target.user.tag}**'s max bet is too low for this bet`)],
        })
    }

    waiting.push(message.author.id)

    updateBalance(message.member, getBalance(message.member) - bet)

    const requestEmbed = new CustomEmbed(
        message.member,
        false,
        `**${message.author.tag}** has challenged you to a coinflip\n\n**bet** $${bet.toLocaleString()}\n\ndo you accept?`
    ).setFooter("expires in 60 seconds")

    await message.channel.send({
        content: `${target.user.toString()} you have been invited to a coinflip worth $${bet.toLocaleString()}`,
        embeds: [requestEmbed],
    })

    const filter = (m) => m.author.id == target.id
    let fail = false

    const response = await message.channel
        .awaitMessages({ filter, max: 1, time: 60000, errors: ["time"] })
        .then((collected) => {
            return collected.first().content.toLowerCase()
        })
        .catch(() => {
            fail = true
            waiting.splice(waiting.indexOf(message.author.id), 1)
            updateBalance(message.member, getBalance(message.member) + bet)
            return message.channel.send({ content: message.author.toString() + " coinflip request expired" })
        })

    if (fail) return

    if (
        response == "yes" ||
        response == "y" ||
        response == "accept" ||
        response == "i accept" ||
        response == "bring it on"
    ) {
        if (bet > getBalance(target)) {
            return message.channel.send({ embeds: [new ErrorEmbed("you cannot afford this bet")] })
        }

        cooldown.set(message.member.id, new Date())

        setTimeout(() => {
            cooldown.delete(message.author.id)
        }, cooldownLength * 1000)

        updateBalance(target, getBalance(target) - bet)

        // its big to make sure that theres little to no deviation in chance cus of rounding
        const lols = [
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
            "heads",
            "tails",
        ]
        const choice = lols[Math.floor(Math.random() * lols.length)]
        let thingy = `${message.author.username}\n${target.user.username}`

        let winner
        let loser

        if (choice == "heads") {
            winner = message.member
            loser = target
        } else {
            winner = target
            loser = message.member
        }

        gamble(winner.user, "coinflip", bet, true, bet * 2)
        gamble(loser.user, "coinflip", bet, false)
        addGamble(winner, "coinflip", true)
        addGamble(loser, "coinflip", false)

        updateBalance(winner, getBalance(winner) + bet * 2)

        waiting.splice(waiting.indexOf(message.author.id), 1)

        const embed = new CustomEmbed(
            message.member,
            true,
            `*throwing..*\n\n${thingy}\n\n**bet** $${bet.toLocaleString()}`
        ).setTitle("coinflip")

        return message.channel.send({ embeds: [embed] }).then((msg) => {
            if (winner == message.member) {
                thingy = `**${message.author.username}** +$${bet.toLocaleString()}\n${target.user.username}`
            } else {
                thingy = `${message.author.username}\n**${target.user.username}** +$${bet.toLocaleString()}`
            }

            embed.setDescription(`**winner** ${winner.user.tag}\n\n${thingy}\n\n**bet** $${bet.toLocaleString()}`)
            embed.setColor(winner.displayHexColor)

            return setTimeout(() => {
                return msg.edit({ embeds: [embed] })
            }, 2000)
        })
    } else {
        updateBalance(message.member, getBalance(message.member) + bet)
        waiting.splice(waiting.indexOf(message.author.id), 1)
        return message.channel.send({ embeds: [new CustomEmbed(target, false, "✅ coinflip request denied")] })
    }
}

cmd.setRun(run)

module.exports = cmd
