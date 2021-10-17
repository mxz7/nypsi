const {
    getBalance,
    createUser,
    updateBalance,
    userExists,
    formatBet,
    getXp,
    updateXp,
    getMulti,
    calcMaxBet,
    getPrestige,
    addGamble,
} = require("../utils/economy/utils.js")
const { Message } = require("discord.js")
const shuffle = require("shuffle-array")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium, getTier } = require("../utils/premium/utils")
const { gamble } = require("../utils/logger.js")

const cooldown = new Map()

const cmd = new Command("rockpaperscissors", "play rock paper scissors", categories.MONEY).setAliases(["rps"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
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

    if (!userExists(message.member)) {
        createUser(message.member)
    }

    const prefix = getPrefix(message.guild)

    if (args.length == 0 || args.length == 1) {
        const embed = new CustomEmbed(message.member)
            .setTitle("rockpaperscissors help")
            .addField("usage", `${prefix}rps <**r**ock/**p**aper/**s**cissors> <bet>`)
            .addField(
                "help",
                "rock paper scissors works exactly how this game does in real life\n" + "**2**x multiplier for winning"
            )

        return message.channel.send({ embeds: [embed] })
    }

    let choice = args[0]
    let memberEmoji = ""

    if (choice != "rock" && choice != "paper" && choice != "scissors" && choice != "r" && choice != "p" && choice != "s") {
        return message.channel.send({
            embeds: [new ErrorEmbed(`${prefix}rps <**r**ock/**p**aper/**s**cissors> <bet>`)],
        })
    }

    if (choice == "r") choice = "rock"
    if (choice == "p") choice = "paper"
    if (choice == "s") choice = "scissors"

    if (choice == "rock") memberEmoji = "🗿"
    if (choice == "paper") memberEmoji = "📰"
    if (choice == "scissors") memberEmoji = "✂"

    if (args[1] == "all") {
        args[1] = getBalance(message.member)
    }

    if (args[1] == "half") {
        args[1] = getBalance(message.member) / 2
    }

    if (isNaN(args[1]) || parseInt(args[1]) <= 0) {
        if (!isNaN(formatBet(args[1]) || !parseInt(formatBet[args[1]]))) {
            args[1] = formatBet(args[1])
        } else {
            return message.channel.send({
                embeds: [new ErrorEmbed(`${prefix}rps <**r**ock/**p**aper/**s**cissors> <bet>`)],
            })
        }
    }

    const bet = parseInt(args[1])

    if (!bet) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid bet")] })
    }

    if (!bet) {
        return message.channel.send({
            embeds: [new ErrorEmbed(`${prefix}rps <**r**ock/**p**aper/**s**cissors> <bet>`)],
        })
    }

    if (bet <= 0) {
        return message.channel.send({
            embeds: [new ErrorEmbed(`${prefix}rps <**r**ock/**p**aper/**s**cissors> <bet>`)],
        })
    }

    if (bet > getBalance(message.member)) {
        return message.channel.send({ embeds: [new ErrorEmbed("you cannot afford this bet")] })
    }

    const maxBet = await calcMaxBet(message.member)

    if (bet > maxBet) {
        return message.channel.send({
            embeds: [
                new ErrorEmbed(
                    `your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`
                ),
            ],
        })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.member.id)
    }, cooldownLength * 1000)

    updateBalance(message.member, getBalance(message.member) - bet)

    const values = ["rock", "paper", "scissors"]

    const index = values.indexOf(choice)

    if (index > -1) {
        values.splice(index, 1)
    }

    const winning = shuffle(values)[Math.floor(Math.random() * values.length)]
    let winningEmoji = ""

    if (winning == "rock") winningEmoji = "🗿"
    if (winning == "paper") winningEmoji = "📰"
    if (winning == "scissors") winningEmoji = "✂"

    let win = false
    let winnings = 0

    if (choice == "rock" && winning == "scissors") {
        win = true

        winnings = Math.round(bet * 1.5)
        updateBalance(message.member, getBalance(message.member) + winnings)
    } else if (choice == "paper" && winning == "rock") {
        win = true

        winnings = Math.round(bet * 1.5)
        updateBalance(message.member, getBalance(message.member) + winnings)
    } else if (choice == "scissors" && winning == "paper") {
        win = true

        winnings = Math.round(bet * 1.5)
        updateBalance(message.member, getBalance(message.member) + winnings)
    }

    let voted = false
    let voteMulti = 0

    if (win) {
        voteMulti = await getMulti(message.member)

        if (voteMulti > 0) {
            voted = true
        }

        if (voted) {
            updateBalance(message.member, getBalance(message.member) + Math.round(winnings * voteMulti))
            winnings = winnings + Math.round(winnings * voteMulti)
        }
    }

    const embed = new CustomEmbed(
        message.member,
        true,
        "*rock..paper..scissors..* **shoot!!**\n\n**choice** " +
            choice +
            " " +
            memberEmoji +
            "\n**bet** $" +
            bet.toLocaleString()
    ).setTitle("rock paper scissors | " + message.member.user.username)

    message.channel.send({ embeds: [embed] }).then((m) => {
        embed.setDescription(
            "**threw** " +
                winning +
                " " +
                winningEmoji +
                "\n\n**choice** " +
                choice +
                " " +
                memberEmoji +
                "\n**bet** $" +
                bet.toLocaleString()
        )

        if (win) {
            if (voted) {
                embed.addField(
                    "**winner!!**",
                    "**you win** $" +
                        winnings.toLocaleString() +
                        "\n" +
                        "+**" +
                        Math.round(voteMulti * 100).toString() +
                        "**% bonus"
                )

                let requiredBet = 1000

                if (getPrestige(message.member) > 2) requiredBet = 10000

                requiredBet += getPrestige(message.member) * 1000

                if (bet >= requiredBet) {
                    const xpBonus = Math.floor(Math.random() * 2) + getPrestige(message.member)

                    const givenXp = xpBonus > 7 ? 7 : xpBonus

                    updateXp(message.member, getXp(message.member) + givenXp)
                    embed.setFooter("+" + givenXp + "xp")
                }
            } else {
                embed.addField("**winner!!**", "**you win** $" + winnings.toLocaleString())
            }

            embed.setColor("#5efb8f")
        } else {
            embed.addField("**loser!!**", "**you lost** $" + bet.toLocaleString())
            embed.setColor("#e4334f")
        }

        setTimeout(() => {
            m.edit({ embeds: [embed] })
        }, 1500)
    })

    gamble(message.author, "rock paper scissors", bet, win, winnings)
    addGamble(message.member, "rps", win)
}

cmd.setRun(run)

module.exports = cmd
