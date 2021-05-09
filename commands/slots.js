const {
    getBalance,
    createUser,
    getMultiplier,
    updateBalance,
    userExists,
    winBoard,
    formatBet,
    getXp,
    updateXp,
    calcMaxBet,
    getMulti,
    getPrestige,
    addGamble,
} = require("../utils/economy/utils.js")
const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium, getTier } = require("../utils/premium/utils")
const { gamble } = require("../utils/logger.js")

const reel1 = [
    "🍉",
    "🍉",
    "🍉",
    "🍉",
    "🍉",
    "🍇",
    "🍇",
    "🍇",
    "🍇",
    "🍊",
    "🍊",
    "🍊",
    "🍊",
    "🍋",
    "🍋",
    "🍒",
]
const reel2 = [
    "🍉",
    "🍉",
    "🍉",
    "🍉",
    "🍉",
    "🍇",
    "🍇",
    "🍇",
    "🍇",
    "🍇",
    "🍊",
    "🍊",
    "🍊",
    "🍊",
    "🍋",
    "🍋",
    "🍋",
    "🍒",
    "🍒",
]
const reel3 = [
    "🍉",
    "🍉",
    "🍉",
    "🍉",
    "🍉",
    "🍉",
    "🍇",
    "🍇",
    "🍇",
    "🍇",
    "🍇",
    "🍊",
    "🍊",
    "🍊",
    "🍋",
    "🍋",
    "🍒",
    "🍒",
]

const cooldown = new Map()

const cmd = new Command("slots", "play slots", categories.MONEY)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let cooldownLength = 10

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
            cooldownLength = 5
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

    if (!userExists(message.member)) {
        createUser(message.member)
    }

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member)
            .setTitle("slots help")
            .addField("usage", `${prefix}slots <bet>\n${prefix}slots info`)
            .addField("help", "you should know how a slot machine works..")
        return message.channel.send(embed)
    }

    if (args.length == 1 && args[0] == "info") {
        const embed = new CustomEmbed(message.member)
            .setTitle("win board")
            .setDescription(winBoard())

        return message.channel.send(embed)
    }

    if (!args[0]) {
        return message.channel.send(
            new ErrorEmbed(`${prefix}slots <bet> | ${prefix}**slots info** shows the winning board`)
        )
    }

    if (args[0] == "all") {
        args[0] = getBalance(message.member)
    }

    if (args[0] == "half") {
        args[0] = getBalance(message.member) / 2
    }

    if (isNaN(args[0]) || parseInt(args[0]) <= 0) {
        if (!isNaN(formatBet(args[0]) || !parseInt(formatBet[args[0]]))) {
            args[0] = formatBet(args[0])
        } else {
            return message.channel.send(
                new ErrorEmbed(
                    `${prefix}slots <bet> | ${prefix}**slots info** shows the winning board`
                )
            )
        }
    }

    const bet = parseInt(args[0])

    if (!bet) {
        return message.channel.send(new ErrorEmbed("invalid bet"))
    }

    if (bet <= 0) {
        return message.channel.send(
            new ErrorEmbed(`${prefix}slots <bet> | ${prefix}**slots info** shows the winning board`)
        )
    }

    if (bet > getBalance(message.member)) {
        return message.channel.send(new ErrorEmbed("you cannot afford this bet"))
    }

    const maxBet = await calcMaxBet(message.member)

    if (bet > maxBet) {
        return message.channel.send(
            new ErrorEmbed(
                `your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`
            )
        )
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    updateBalance(message.member, getBalance(message.member) - bet)

    let one = reel1[Math.floor(Math.random() * reel1.length)]
    let two = reel2[Math.floor(Math.random() * reel2.length)]
    let three = reel3[Math.floor(Math.random() * reel3.length)]

    if (two == three && one != two) {
        const chance = Math.floor(Math.random() * 10)
        let chanceScore = 4

        if (getBalance(message.member) >= 1000000) {
            chanceScore = 2
        }

        if (chance < chanceScore) {
            one = two
        }
    }

    if (one == two && one != three) {
        const chance = Math.floor(Math.random() * 10)
        let chanceScore = 4

        if (getBalance(message.member) >= 1000000) {
            chanceScore = 2
        }

        if (chance < chanceScore) {
            three = two
        }
    }

    if (
        one == two &&
        one == three &&
        one != "🍒" &&
        one != "🍋" &&
        getBalance(message.member) < 1000000
    ) {
        const chance = Math.floor(Math.random() * 10)

        if (chance < 3) {
            one == "🍋"
            two == "🍋"
            three == "🍋"
        } else if (chance < 2) {
            one == "🍒"
            two == "🍒"
            three == "🍒"
        }
    }

    let win = false
    let winnings = 0

    if (one == two && two == three) {
        const multiplier = getMultiplier(one)

        win = true
        winnings = Math.round(multiplier * bet)

        updateBalance(message.member, getBalance(message.member) + winnings)
    } else if (one == two) {
        win = true
        winnings = Math.round(bet * 1.2)

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
            updateBalance(
                message.member,
                getBalance(message.member) + Math.round(winnings * voteMulti)
            )
            winnings = winnings + Math.round(winnings * voteMulti)
        }
    }

    const embed = new CustomEmbed(
        message.member,
        true,
        "---------------\n" +
            one +
            " | " +
            two +
            " | " +
            three +
            "\n---------------\n**bet** $" +
            bet.toLocaleString()
    ).setTitle("slots | " + message.member.user.username)

    message.channel.send(embed).then((m) => {
        if (win) {
            if (voted) {
                embed.addField(
                    "**winner!!**",
                    "**you win** $" +
                        winnings.toLocaleString() +
                        "\n" +
                        "+**" +
                        Math.floor(voteMulti * 100).toString() +
                        "**% bonus"
                )

                let requiredBet = 1000

                if (getPrestige(message.member) > 2) requiredBet = 10000

                requiredBet += getPrestige(message.member) * 1000

                if (bet >= requiredBet) {
                    const xpBonus = Math.floor(Math.random() * 2) + getPrestige(message.member)

                    const givenXp = xpBonus > 15 ? 15 : xpBonus

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
            m.edit(embed)
        }, 1500)
    })

    gamble(message.author, "slots", bet, win, winnings)
    addGamble(message.member, "slots", win)
}

cmd.setRun(run)

module.exports = cmd
