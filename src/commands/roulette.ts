const {
    getBalance,
    createUser,
    updateBalance,
    userExists,
    formatBet,
    getXp,
    updateXp,
    calcMaxBet,
    getMulti,
    getPrestige,
    addGamble,
} = require("../utils/economy/utils.js")
import { CommandInteraction, Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
import { getPrefix } from "../utils/guilds/utils"
const { isPremium, getTier } = require("../utils/premium/utils")
const { gamble } = require("../utils/logger.js")

const values = [
    "b",
    "r",
    "b",
    "r",
    "b",
    "r",
    "b",
    "r",
    "b",
    "r",
    "b",
    "r",
    "b",
    "r",
    "b",
    "r",
    "g",
    "b",
    "r",
    "b",
    "r",
    "b",
    "r",
    "b",
    "r",
    "b",
    "r",
    "b",
    "r",
    "b",
    "r",
    "b",
    "r",
    "b",
    "r",
    "b",
    "r",
]

const cooldown = new Map()

const cmd = new Command("roulette", "play roulette", Categories.MONEY).setAliases(["r"])

cmd.slashEnabled = true
cmd.slashData
    .addStringOption((option) =>
        option
            .setName("color")
            .setDescription("color to bet on")
            .setRequired(true)
            .addChoice("🔴 red", "red")
            .addChoice("⚫ black", "black")
            .addChoice("🟢 green", "green")
    )
    .addIntegerOption((option) => option.setName("bet").setDescription("how much would you like to bet").setRequired(true))

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

    if (!userExists(message.member)) createUser(message.member)

    if (args.length == 1 && args[0].toLowerCase() == "odds") {
        return send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    false,
                    "🔴 " +
                        (values.length - 1) / 2 +
                        "/" +
                        values.length +
                        " win **1.5**x\n" +
                        "⚫ " +
                        (values.length - 1) / 2 +
                        "/" +
                        values.length +
                        " win **1.5**x\n" +
                        "🟢 1/" +
                        values.length +
                        " win **17**x"
                ),
            ],
        })
    }

    const prefix = getPrefix(message.guild)

    if (args.length != 2) {
        const embed = new CustomEmbed(message.member)
            .setTitle("roulette help")
            .addField("usage", `${prefix}roulette <colour (**r**ed/**g**reen/**b**lack)> <bet>\n${prefix}roulette odds`)
            .addField(
                "help",
                "this is a bit of a simpler version of real roulette, as in you can only bet on red, black and green which mimics typical csgo roulette\n" +
                    "red and black give a **1.5x** win and green gives a **17**x win"
            )

        return send({ embeds: [embed] })
    }

    if (args[0] != "red" && args[0] != "green" && args[0] != "black" && args[0] != "r" && args[0] != "g" && args[0] != "b") {
        return send({
            embeds: [
                new ErrorEmbed(
                    `${prefix}roulette <colour (**r**ed/**g**reen/**b**lack)> <bet> | ${prefix}**roulette odds** shows the odds of winning`
                ),
            ],
        })
    }

    if (args[0] == "red") {
        args[0] = "r"
    } else if (args[0] == "green") {
        args[0] = "g"
    } else if (args[0] == "black") {
        args[0] = "b"
    }

    const maxBet = await calcMaxBet(message.member)

    if (args[1] == "all") {
        args[1] = getBalance(message.member)
        if (getBalance(message.member) > maxBet) {
            args[1] = maxBet
        }
    }

    if (args[1] == "half") {
        args[1] = getBalance(message.member) / 2
    }

    if (isNaN(args[1]) || parseInt(args[1]) <= 0) {
        if (!isNaN(formatBet(args[1]) || !parseInt(formatBet[args[1]]))) {
            args[1] = formatBet(args[1])
        } else {
            return send({
                embeds: [
                    new ErrorEmbed(
                        `${prefix}roulette <colour (**r**ed/**g**reen/**b**lack)> <bet> | ${prefix}**roulette odds** shows the odds of winning`
                    ),
                ],
            })
        }
    }

    const bet = parseInt(args[1])

    if (!bet) {
        return send({ embeds: [new ErrorEmbed("invalid bet")] })
    }

    if (bet <= 0) {
        return send({
            embeds: [
                new ErrorEmbed(
                    `${prefix}roulette <colour (**r**ed/**g**reen/**b**lack)> <bet> | ${prefix}**roulette odds** shows the odds of winning`
                ),
            ],
        })
    }

    if (!bet) {
        return send({
            embeds: [
                new ErrorEmbed(
                    `${prefix}roulette <colour (**r**ed/**g**reen/**b**lack)> <bet> | ${prefix}**roulette odds** shows the odds of winning`
                ),
            ],
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

    let colorBet = args[0].toLowerCase()

    updateBalance(message.member, getBalance(message.member) - bet)

    let roll = values[Math.floor(Math.random() * values.length)]

    let win = false
    let winnings = 0

    if (colorBet == roll) {
        win = true
        if (roll == "g") {
            winnings = Math.round(bet * 17)
        } else {
            winnings = Math.round(bet * 1.5)
        }
        updateBalance(message.member, getBalance(message.member) + winnings)
    }

    if (colorBet == "b") {
        colorBet = "⚫"
    }
    if (colorBet == "r") {
        colorBet = "🔴"
    }
    if (colorBet == "g") {
        colorBet = "🟢"
    }

    if (roll == "b") {
        roll = "⚫"
    } else if (roll == "r") {
        roll = "🔴"
    } else if (roll == "g") {
        roll = "🟢"
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
        "*spinning wheel..*\n\n**choice** " + colorBet + "\n**your bet** $" + bet.toLocaleString()
    ).setTitle("roulette wheel | " + message.member.user.username)

    const edit = async (data, msg) => {
        if (message.interaction) {
            return await message.editReply(data)
        } else {
            return await msg.edit(data)
        }
    }

    send({ embeds: [embed] }).then((m) => {
        embed.setDescription(
            "**landed on** " + roll + "\n\n**choice** " + colorBet + "\n**your bet** $" + bet.toLocaleString()
        )

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

                requiredBet += getPrestige(message.member) * 5000

                if (bet >= requiredBet) {
                    const xpBonus =
                        Math.floor(Math.random() * 2) + (getPrestige(message.member) == 0 ? 1 : getPrestige(message.member))

                    const givenXp = xpBonus > 5 ? 5 : xpBonus

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
            edit({ embeds: [embed] }, m)
        }, 2000)
    })
    gamble(message.author, "roulette", bet, win, winnings)
    addGamble(message.member, "roulette", win)
}

cmd.setRun(run)

module.exports = cmd
