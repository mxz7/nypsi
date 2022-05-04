import {
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
    addGamble,
    calcEarnedXp,
} from "../utils/economy/utils.js"
import { CommandInteraction, Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
import { getPrefix } from "../utils/guilds/utils"
import { isPremium, getTier } from "../utils/premium/utils"
import { gamble } from "../utils/logger.js"

const reel1 = ["🍉", "🍉", "🍉", "🍉", "🍉", "🍇", "🍇", "🍇", "🍇", "🍊", "🍊", "🍊", "🍊", "🍋", "🍋", "🍒"]
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
const reel3 = ["🍉", "🍉", "🍉", "🍉", "🍉", "🍉", "🍇", "🍇", "🍇", "🍇", "🍇", "🍊", "🍊", "🍊", "🍋", "🍋", "🍒", "🍒"]

const cooldown = new Map()

const cmd = new Command("slots", "play slots", Categories.MONEY)

cmd.slashEnabled = true

cmd.slashData.addIntegerOption((option) =>
    option.setName("bet").setDescription("how much would you like to bet").setRequired(true)
)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    let cooldownLength = 10

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
            cooldownLength = 3
        } else {
            cooldownLength = 6
        }
    }

    const send = async (data) => {
        if (message.interaction) {
            return await message.reply(data)
        } else {
            return await message.channel.send(data)
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
        return send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
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
        return send({ embeds: [embed] })
    }

    if (args.length == 1 && args[0] == "info") {
        const embed = new CustomEmbed(message.member).setTitle("win board").setDescription(winBoard())

        return send({ embeds: [embed] })
    }

    if (!args[0]) {
        return send({
            embeds: [new ErrorEmbed(`${prefix}slots <bet> | ${prefix}**slots info** shows the winning board`)],
        })
    }

    const maxBet = calcMaxBet(message.member)

    const bet = formatBet(args[0], message.member)

    if (!bet) {
        return send({ embeds: [new ErrorEmbed("invalid bet")] })
    }

    if (bet <= 0) {
        return send({
            embeds: [new ErrorEmbed(`${prefix}slots <bet> | ${prefix}**slots info** shows the winning board`)],
        })
    }

    if (bet > getBalance(message.member)) {
        return send({ embeds: [new ErrorEmbed("you cannot afford this bet")] })
    }

    if (bet > maxBet) {
        return send({
            embeds: [
                new ErrorEmbed(
                    `your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`
                ),
            ],
        })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    updateBalance(message.member, getBalance(message.member) - bet)

    let one = reel1[Math.floor(Math.random() * reel1.length)]
    const two = reel2[Math.floor(Math.random() * reel2.length)]
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

    if (one == two && one == three && one != "🍒" && one != "🍋" && getBalance(message.member) < 1000000) {
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

    let multi = 0

    if (win) {
        multi = getMulti(message.member)

        if (multi > 0) {
            updateBalance(message.member, getBalance(message.member) + Math.round(winnings * multi))
            winnings = winnings + Math.round(winnings * multi)
        }
    }

    const embed = new CustomEmbed(
        message.member,
        true,
        "---------------\n" + one + " | " + two + " | " + three + "\n---------------\n**bet** $" + bet.toLocaleString()
    ).setTitle("slots | " + message.member.user.username)

    const edit = async (data, msg) => {
        if (!(message instanceof Message)) {
            return await message.editReply(data)
        } else {
            return await msg.edit(data)
        }
    }

    send({ embeds: [embed] }).then((m) => {
        if (win) {
            if (multi > 0) {
                embed.addField(
                    "**winner!!**",
                    "**you win** $" +
                        winnings.toLocaleString() +
                        "\n" +
                        "+**" +
                        Math.floor(multi * 100).toString() +
                        "**% bonus"
                )
            } else {
                embed.addField("**winner!!**", "**you win** $" + winnings.toLocaleString())
            }

            const earnedXp = calcEarnedXp(message.member, bet)

            if (earnedXp > 0) {
                updateXp(message.member, getXp(message.member) + earnedXp)
                embed.setFooter(`+${earnedXp}xp`)
            }

            embed.setColor("#5efb8f")
        } else {
            embed.addField("**loser!!**", "**you lost** $" + bet.toLocaleString())
            embed.setColor("#e4334f")
        }

        setTimeout(() => {
            edit({ embeds: [embed] }, m)
        }, 1500)
    })

    gamble(message.author, "slots", bet, win, winnings)
    addGamble(message.member, "slots", win)
}

cmd.setRun(run)

module.exports = cmd
