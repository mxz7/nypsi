import {
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
} from "../utils/economy/utils.js"
import { CommandInteraction, Message } from "discord.js"
import * as shuffle from "shuffle-array"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
import { getPrefix } from "../utils/guilds/utils"
import { isPremium, getTier } from "../utils/premium/utils"
import { gamble } from "../utils/logger.js"

const cooldown = new Map()

const cmd = new Command("rockpaperscissors", "play rock paper scissors", Categories.MONEY).setAliases(["rps"])

cmd.slashEnabled = true
cmd.slashData
    .addStringOption((option) =>
        option
            .setName("choice")
            .setDescription("choice for the bet")
            .setRequired(true)
            .addChoice("🗿 rock", "rock")
            .addChoice("📰 paper", "paper")
            .addChoice("✂ scissors", "scissors")
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
        if (!(message instanceof Message)) {
            await message.reply(data)
            const replyMsg = await message.fetchReply()
            if (replyMsg instanceof Message) {
                return replyMsg
            }
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

    if (args.length == 0 || args.length == 1) {
        const embed = new CustomEmbed(message.member)
            .setTitle("rockpaperscissors help")
            .addField("usage", `${prefix}rps <**r**ock/**p**aper/**s**cissors> <bet>`)
            .addField(
                "help",
                "rock paper scissors works exactly how this game does in real life\n" + "**2**x multiplier for winning"
            )

        return send({ embeds: [embed] })
    }

    let choice = args[0]
    let memberEmoji = ""

    if (choice != "rock" && choice != "paper" && choice != "scissors" && choice != "r" && choice != "p" && choice != "s") {
        return send({
            embeds: [new ErrorEmbed(`${prefix}rps <**r**ock/**p**aper/**s**cissors> <bet>`)],
        })
    }

    if (choice == "r") choice = "rock"
    if (choice == "p") choice = "paper"
    if (choice == "s") choice = "scissors"

    if (choice == "rock") memberEmoji = "🗿"
    if (choice == "paper") memberEmoji = "📰"
    if (choice == "scissors") memberEmoji = "✂"

    const maxBet = calcMaxBet(message.member)

    const bet = formatBet(args[1], message.member)

    if (!bet) {
        return send({ embeds: [new ErrorEmbed("invalid bet")] })
    }

    if (!bet) {
        return send({
            embeds: [new ErrorEmbed(`${prefix}rps <**r**ock/**p**aper/**s**cissors> <bet>`)],
        })
    }

    if (bet <= 0) {
        return send({
            embeds: [new ErrorEmbed(`${prefix}rps <**r**ock/**p**aper/**s**cissors> <bet>`)],
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

    const edit = async (data, msg) => {
        if (!(message instanceof Message)) {
            await message.editReply(data)
            return await message.fetchReply()
        } else {
            return await msg.edit(data)
        }
    }

    send({ embeds: [embed] }).then((m) => {
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
        }, 1500)
    })

    gamble(message.author, "rock paper scissors", bet, win, winnings)
    addGamble(message.member, "rps", win)
}

cmd.setRun(run)

module.exports = cmd
