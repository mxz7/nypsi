const { Message, MessageActionRow, MessageButton } = require("discord.js")
const {
    userExists,
    createUser,
    getBalance,
    updateBalance,
    formatBet,
    getXp,
    updateXp,
    calcMaxBet,
    getMulti,
    getPrestige,
    addGamble,
} = require("../utils/economy/utils.js")
const shuffle = require("shuffle-array")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium, getTier } = require("../utils/premium/utils")
const { gamble } = require("../utils/logger.js")

const cooldown = new Map()
const games = new Map()

const cmd = new Command("highlow", "higher or lower game", categories.MONEY).setAliases(["hl"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!userExists(message.member)) createUser(message.member)

    let cooldownLength = 30

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
            cooldownLength = 5
        } else {
            cooldownLength = 15
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

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member)
            .setTitle("highlow help")
            .addField("usage", `${prefix}highlow <bet>\n${prefix}highlow info`)
            .addField(
                "game rules",
                "you'll receive your first card and you have to predict whether the next card you pick up will be higher or lower in value than the card that you have, you can cash out after predicting correctly once."
            )
            .addField(
                "help",
                "**A**ce | value of 1\n**J**ack | value of 11\n" +
                    "**Q**ueen | value of 12\n**K**ing | value of 13\n" +
                    "⬆ **higher** the next card will be higher in value than your current card\n" +
                    "⬇ **lower** the next card will be lower in value than your current card\n" +
                    "💰 **cash out** end the game and receive the current win\nmax win **15**x"
            )

        return message.channel.send({ embeds: [embed] })
    }

    if (args[0] == "info") {
        const embed = new CustomEmbed(
            message.member,
            false,
            "highlow works exactly how it would in real life\n" +
                "when you create a game, a full 52 deck is shuffled in a random order\n" +
                "for every new card you take, it is taken from the first in the deck (array) and then removed from the deck\n" +
                "view the code for this [here](https://github.com/tekohxd/nypsi/blob/master/commands/highlow.js#L123)"
        ).setTitle("highlow help")

        return message.channel.send({ embeds: [embed] })
    }

    if (args[0] == "all") {
        args[0] = getBalance(message.member)
    }

    if (args[0] == "half") {
        args[0] = getBalance(message.member) / 2
    }

    if (parseInt(args[0])) {
        args[0] = formatBet(args[0])
    } else {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid bet")] })
    }

    const bet = parseInt(args[0])

    if (!bet) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid bet")] })
    }

    if (bet <= 0) {
        return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}highlow <bet>`)] })
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

    if (games.has(message.member.user.id)) {
        return message.channel.send({ embeds: [new ErrorEmbed("you are already playing highlow")] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    updateBalance(message.member, getBalance(message.member) - bet)

    const id = Math.random()

    const newDeck = [
        "A♠",
        "2♠",
        "3♠",
        "4♠",
        "5♠",
        "6♠",
        "7♠",
        "8♠",
        "9♠",
        "10♠",
        "J♠",
        "Q♠",
        "K♠",
        "A♣",
        "2♣",
        "3♣",
        "4♣",
        "5♣",
        "6♣",
        "7♣",
        "8♣",
        "9♣",
        "10♣",
        "J♣",
        "Q♣",
        "K♣",
        "A♥️",
        "2♥️",
        "3♥️",
        "4♥️",
        "5♥️",
        "6♥️",
        "7♥️",
        "8♥️",
        "9♥️",
        "10♥️",
        "J♥️",
        "Q♥️",
        "K♥️",
        "A♦",
        "2♦",
        "3♦",
        "4♦",
        "5♦",
        "6♦",
        "7♦",
        "8♦",
        "9♦",
        "10♦",
        "J♦",
        "Q♦",
        "K♦",
    ]

    const voteMulti = await getMulti(message.member)

    games.set(message.member.user.id, {
        bet: bet,
        win: 0,
        deck: shuffle(newDeck),
        card: "",
        id: id,
        voted: voteMulti,
    })

    setTimeout(() => {
        if (games.has(message.author.id)) {
            if (games.get(message.author.id).id == id) {
                games.delete(message.author.id)
                updateBalance(message.member, getBalance(message.member) + bet)
                if (cooldown.has(message.author.id)) {
                    cooldown.delete(message.author.id)
                }
            }
        }
    }, 180000)

    newCard(message.member)

    const row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId("⬆").setLabel("higher").setStyle("PRIMARY"),
        new MessageButton().setCustomId("⬇").setLabel("lower").setStyle("PRIMARY"),
        new MessageButton().setCustomId("💰").setLabel("cash out").setStyle("SUCCESS").setDisabled(true)
    )

    const embed = new CustomEmbed(message.member, true, "**bet** $" + bet.toLocaleString() + "\n**0**x ($0)")
        .setTitle("highlow | " + message.member.user.username)
        .addField("card", "| " + games.get(message.member.user.id).card + " |")

    message.channel.send({ embeds: [embed], components: [row] }).then((m) => {
        playGame(message, m).catch((e) => {
            console.error(e)
            return message.channel.send({
                embeds: [new ErrorEmbed("an error occured while running - join support server")],
            })
        })
    })
}

cmd.setRun(run)

module.exports = cmd

function newCard(member) {
    const deck = games.get(member.user.id).deck

    const choice = deck[0]

    deck.shift()

    games.set(member.user.id, {
        bet: games.get(member.user.id).bet,
        win: games.get(member.user.id).win,
        deck: deck,
        card: choice,
        id: games.get(member.user.id).id,
        voted: games.get(member.user.id).voted,
    })
}

function getValue(member) {
    const card = games.get(member.user.id).card.toLowerCase()

    if (card.includes("k")) {
        return 13
    } else if (card.includes("q")) {
        return 12
    } else if (card.includes("j")) {
        return 11
    } else if (card.includes("a")) {
        return "1"
    } else {
        if (!parseInt(card.split()[0])) {
            return "ERROR"
        }
        return parseInt(card.split()[0])
    }
}

/**
 *
 * @param {Message} message
 * @param {Message} m
 * @returns
 */
async function playGame(message, m) {
    if (!games.has(message.author.id)) return

    const bet = games.get(message.member.user.id).bet
    let win = games.get(message.member.user.id).win
    let card = games.get(message.member.user.id).card

    const newEmbed = new CustomEmbed(message.member, true).setTitle("highlow | " + message.member.user.username)

    const lose = async () => {
        gamble(message.author, "highlow", bet, false, 0)
        addGamble(message.member, "highlow", false)
        newEmbed.setColor("#e4334f")
        newEmbed.setDescription(
            "**bet** $" +
                bet.toLocaleString() +
                "\n**" +
                win +
                "**x ($" +
                Math.round(bet * win).toLocaleString() +
                ")" +
                "\n\n**you lose!!**"
        )
        newEmbed.addField("card", "| " + card + " |")
        games.delete(message.author.id)
        return await m.edit({ embeds: [newEmbed], components: [] })
    }

    const win1 = async () => {
        let winnings = Math.round(bet * win)

        newEmbed.setColor("#5efb8f")
        if (games.get(message.member.user.id).voted > 0) {
            winnings = winnings + Math.round(winnings * games.get(message.member.user.id).voted)

            let requiredBet = 1000

            if (getPrestige(message.member) > 2) requiredBet = 10000

            requiredBet += getPrestige(message.member) * 1000

            if (bet >= requiredBet) {
                const xpBonus = Math.floor(Math.random() * 2) + getPrestige(message.member)

                const givenXp = xpBonus > 7 ? 7 : xpBonus

                updateXp(message.member, getXp(message.member) + givenXp)
                newEmbed.setFooter("+" + givenXp + "xp")
            }

            newEmbed.setDescription(
                "**bet** $" +
                    bet.toLocaleString() +
                    "\n" +
                    "**" +
                    win +
                    "**x ($" +
                    Math.round(bet * win).toLocaleString() +
                    ")" +
                    "\n\n**winner!!**\n**you win** $" +
                    winnings.toLocaleString() +
                    "\n" +
                    "+**" +
                    Math.floor(games.get(message.member.user.id).voted * 100).toString() +
                    "**% bonus"
            )
        } else {
            newEmbed.setDescription(
                "**bet** $" +
                    bet.toLocaleString() +
                    "\n" +
                    "**" +
                    win +
                    "**x ($" +
                    Math.round(bet * win).toLocaleString() +
                    ")" +
                    "\n\n**winner!!**\n**you win** $" +
                    winnings.toLocaleString()
            )
        }
        gamble(message.author, "highlow", bet, true, winnings)
        addGamble(message.member, "highlow", true)
        newEmbed.addField("card", "| " + card + " |")
        updateBalance(message.member, getBalance(message.member) + winnings)
        games.delete(message.author.id)
        return m.edit({ embeds: [newEmbed], components: [] })
    }

    const draw = async () => {
        gamble(message.author, "highlow", bet, true, bet)
        addGamble(message.member, "highlow", true)
        newEmbed.setColor("#E5FF00")
        newEmbed.setDescription(
            "**bet** $" +
                bet.toLocaleString() +
                "\n**" +
                win +
                "**x ($" +
                Math.round(bet * win).toLocaleString() +
                ")" +
                "\n\n**draw!!**\nyou win $" +
                bet.toLocaleString()
        )
        newEmbed.addField("card", "| " + card + " |")
        updateBalance(message.member, getBalance(message.member) + bet)
        games.delete(message.author.id)
        return await m.edit({ embeds: [newEmbed], components: [] })
    }

    if (win == 15) {
        return win1()
    }

    const filter = (i) => i.user.id == message.author.id

    let fail = false

    const reaction = await m
        .awaitMessageComponent({ filter, time: 30000, errors: ["time"] })
        .then(async (collected) => {
            await collected.deferUpdate()
            return collected.customId
        })
        .catch(() => {
            fail = true
            games.delete(message.author.id)
            return message.channel.send({ content: message.author.toString() + " highlow game expired" })
        })

    if (fail) return

    if (reaction == "⬆") {
        const oldCard = getValue(message.member)
        newCard(message.member)
        card = games.get(message.member.user.id).card
        const newCard1 = getValue(message.member)

        if (newCard1 > oldCard) {
            if (win == 0) {
                win += 1
            } else if (win > 2.5) {
                win += 1
            } else {
                win += 0.5
            }

            games.set(message.member.user.id, {
                bet: bet,
                win: win,
                deck: games.get(message.member.user.id).deck,
                card: games.get(message.member.user.id).card,
                id: games.get(message.member.user.id).id,
                voted: games.get(message.member.user.id).voted,
            })

            let row = new MessageActionRow().addComponents(
                new MessageButton().setCustomId("⬆").setLabel("higher").setStyle("PRIMARY"),
                new MessageButton().setCustomId("⬇").setLabel("lower").setStyle("PRIMARY"),
                new MessageButton().setCustomId("💰").setLabel("cash out").setStyle("SUCCESS").setDisabled(true)
            )

            if (win >= 1) {
                row = new MessageActionRow().addComponents(
                    new MessageButton().setCustomId("⬆").setLabel("higher").setStyle("PRIMARY"),
                    new MessageButton().setCustomId("⬇").setLabel("lower").setStyle("PRIMARY"),
                    new MessageButton().setCustomId("💰").setLabel("cash out").setStyle("SUCCESS").setDisabled(false)
                )
            }

            newEmbed.setDescription(
                "**bet** $" + bet.toLocaleString() + "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")"
            )
            newEmbed.addField("card", "| " + card + " |")
            await m.edit({ embeds: [newEmbed], components: [row] })
            return playGame(message, m)
        } else if (newCard1 == oldCard) {
            newEmbed.setDescription(
                "**bet** $" + bet.toLocaleString() + "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")"
            )
            newEmbed.addField("card", "| " + card + " |")

            await m.edit({ embeds: [newEmbed] })
            return playGame(message, m)
        } else {
            return lose()
        }
    } else if (reaction == "⬇") {
        const oldCard = getValue(message.member)
        newCard(message.member)
        card = games.get(message.member.user.id).card
        const newCard1 = getValue(message.member)

        if (newCard1 < oldCard) {
            if (win < 2) {
                win += 0.5
            } else {
                win += 1
            }

            games.set(message.member.user.id, {
                bet: bet,
                win: win,
                deck: games.get(message.member.user.id).deck,
                card: games.get(message.member.user.id).card,
                id: games.get(message.member.user.id).id,
                voted: games.get(message.member.user.id).voted,
            })

            let row = new MessageActionRow().addComponents(
                new MessageButton().setCustomId("⬆").setLabel("higher").setStyle("PRIMARY"),
                new MessageButton().setCustomId("⬇").setLabel("lower").setStyle("PRIMARY"),
                new MessageButton().setCustomId("💰").setLabel("cash out").setStyle("SUCCESS").setDisabled(true)
            )

            if (win >= 1) {
                row = new MessageActionRow().addComponents(
                    new MessageButton().setCustomId("⬆").setLabel("higher").setStyle("PRIMARY"),
                    new MessageButton().setCustomId("⬇").setLabel("lower").setStyle("PRIMARY"),
                    new MessageButton().setCustomId("💰").setLabel("cash out").setStyle("SUCCESS").setDisabled(false)
                )
            }

            newEmbed.setDescription(
                "**bet** $" + bet.toLocaleString() + "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")"
            )
            newEmbed.addField("card", "| " + card + " |")
            await m.edit({ embeds: [newEmbed], components: [row] })
            return playGame(message, m)
        } else if (newCard1 == oldCard) {
            newEmbed.setDescription(
                "**bet** $" + bet.toLocaleString() + "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")"
            )
            newEmbed.addField("card", "| " + card + " |")
            await m.edit({ embeds: [newEmbed] })
            return playGame(message, m)
        } else {
            return lose()
        }
    } else if (reaction == "💰") {
        if (win < 1) {
            return playGame(message, m)
        } else if (win == 1) {
            return draw()
        } else {
            return win1()
        }
    } else {
        games.delete(message.author.id)
        return m.reactions.removeAll()
    }
}
