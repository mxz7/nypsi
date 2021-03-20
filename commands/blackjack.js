const { Message } = require("discord.js")
const { userExists, createUser, getBalance, updateBalance, formatBet, getXp, updateXp, calcMaxBet, getMulti, getPrestige } = require("../economy/utils.js")
const shuffle = require("shuffle-array")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getPrefix } = require("../guilds/utils.js")
const { isPremium, getTier } = require("../premium/utils.js")

const cooldown = new Map()
const games = new Map()

const cmd = new Command("blackjack", "play blackjack", categories.MONEY).setAliases(["bj"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (!userExists(message.member)) createUser(message.member)

    if (games.has(message.member.user.id)) {
        return message.channel.send(new ErrorEmbed("you are already playing blackjack"))
    }

    let cooldownLength = 30

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
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
        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``))
    }

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member, false)
            .setTitle("blackjack help")
            .addField("usage", `${prefix}blackjack <bet>\n${prefix}blackjack info`)
            .addField("game rules", "in blackjack, the aim is to get **21**, or as close as to **21** as you can get without going over\n" +
                "the dealer will always stand on or above **17**\n" +
                "**2**x multiplier for winning, on a draw you receive your bet back")
            .addField("help", "1️⃣ **hit** receive a new card\n" + 
                "2️⃣ **stand** end your turn and allow the dealer to play\n" + 
                "3️⃣ **double down** take one more card and double your bet")

        return message.channel.send(embed)
    }

    if (args[0] == "info") {
        const embed = new CustomEmbed(message.member, false, "blackjack works exactly how it would in real life\n" +
            "when you create a game, a full 52 deck is shuffled in a random order\n" +
            "for every new card you take, it is taken from the first in the deck (array) and then removed from the deck\n" +
            "view the code for this [here](https://github.com/tekohxd/nypsi/blob/master/commands/blackjack.js#L128)")
            .setTitle("blackjack help")
        
        return message.channel.send(embed)
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
        return message.channel.send(new ErrorEmbed("invalid bet"))
    }

    const bet = parseInt(args[0])

    if (bet <= 0) {
        return message.channel.send(new ErrorEmbed(`${prefix}blackjack <bet>`))
    }

    if (bet > getBalance(message.member)) {
        return message.channel.send(new ErrorEmbed("you cannot afford this bet"))
    }

    const maxBet = await calcMaxBet(message.member)

    if (bet > maxBet) {
        return message.channel.send(new ErrorEmbed(`your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`))
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    updateBalance(message.member, getBalance(message.member) - bet)

    const id = Math.random()

    const newDeck = ["A♠", "2♠", "3♠", "4♠", "5♠", "6♠", "7♠", "8♠", "9♠", "10♠", "J♠", "Q♠", "K♠", 
        "A♣", "2♣", "3♣", "4♣", "5♣", "6♣", "7♣", "8♣", "9♣", "10♣", "J♣", "Q♣", "K♣", 
        "A♥️", "2♥️", "3♥️", "4♥️", "5♥️", "6♥️", "7♥️", "8♥️", "9♥️", "10♥️", "J♥️", "Q♥️", "K♥️",
        "A♦", "2♦", "3♦", "4♦", "5♦", "6♦", "7♦", "8♦", "9♦", "10♦", "J♦", "Q♦", "K♦"]

    
    const multi = await getMulti(message.member)
    
    games.set(message.member.user.id, {
        bet: bet,
        deck: shuffle(newDeck),
        cards: [],
        dealerCards: [],
        id: id,
        first: true,
        dealerPlay: false,
        voted: multi
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

    newDealerCard(message.member)
    newCard(message.member)
    newDealerCard(message.member)
    newCard(message.member)

    const loadingEmbed = new CustomEmbed(message.member, false)
        .setTitle("loading.. | " + message.member.user.username)

    const embed = new CustomEmbed(message.member, true, "**bet** $" + bet.toLocaleString())
        .setTitle("blackjack | " + message.member.user.username)
        .addField("dealer", games.get(message.member.user.id).dealerCards[0])
        .addField(message.member.user.tag, getCards(message.member) + " **" + calcTotal(message.member) + "**")
    
    if (getBalance(message.member) >= bet) {
        embed.addField("help", "1️⃣ hit | 2️⃣ stand | 3️⃣ double down")
    } else {
        embed.addField("help", ":one: hit | :two: stand")
    }

    message.channel.send(loadingEmbed).then(async m => {
        await m.react("1️⃣")
        await m.react("2️⃣")

        if (getBalance(message.member) >= bet) {
            await m.react("3️⃣")
        }

        await m.edit(embed)
        playGame(message, m).catch(e => {
            console.error(e)
            return message.channel.send(new ErrorEmbed("an error occured while running - join support server"))
        })
    }).catch()

}

cmd.setRun(run)

module.exports = cmd

function newCard(member) {
    const bet = games.get(member.user.id).bet
    const deck = games.get(member.user.id).deck
    const cards = games.get(member.user.id).cards
    const dealerCards = games.get(member.user.id).dealerCards
    const id = games.get(member.user.id).id
    const first = games.get(member.user.id).first
    const voted = games.get(member.user.id).voted

    const choice = deck[0]

    deck.shift()

    cards.push(choice)

    games.set(member.user.id, {
        bet: bet,
        deck: deck,
        cards: cards,
        dealerCards: dealerCards,
        id: id,
        first: first,
        dealerPlay: false,
        voted: voted
    })
}

function newDealerCard(member) {
    const bet = games.get(member.user.id).bet
    const deck = games.get(member.user.id).deck
    const cards = games.get(member.user.id).cards
    const dealerCards = games.get(member.user.id).dealerCards
    const id = games.get(member.user.id).id
    const first = games.get(member.user.id).first
    const voted = games.get(member.user.id).voted

    const choice = deck[0]

    deck.shift()

    dealerCards.push(choice)

    games.set(member.user.id, {
        bet: bet,
        deck: deck,
        cards: cards,
        dealerCards: dealerCards,
        id: id,
        first: first,
        dealerPlay: false,
        voted: voted
    })
}

function calcTotal(member) {
    const cards = games.get(member.user.id).cards

    let total = 0
    let aces = 0

    let aceAs11 = false

    for (let card of cards) {
        card = card.split("♠").join().split("♣").join().split("♥️").join().split("♦").join()
        
        if (card.includes("K") || card.includes("Q") || card.includes("J")) {
            total = total + 10
        } else if (card.includes("A")) {
            aces++
        } else {
            total = total + parseInt(card)
        }
    }

    if (aces > 0) {
        for (let i = 0; i < aces; i++) {
            if (aces > 1) {
                total = total + 1
            } else {
                if (total <= 10) {
                    total = total + 11
                    aceAs11 = true
                } else {
                    total = total + 1
                }
            }
        }
    }

    if (total > 21) {
        if (aceAs11) {
            total = total - 10
        }
    }

    return total
}

function calcTotalDealer(member) {
    const cards = games.get(member.user.id).dealerCards

    let total = 0
    let aces = 0

    let aceAs11 = false

    for (let card of cards) {
        card = card.split("♠").join().split("♣").join().split("♥️").join().split("♦").join()
        
        if (card.includes("K") || card.includes("Q") || card.includes("J")) {
            total = total + 10
        } else if (card.includes("A")) {
            aces++
        } else {
            total = total + parseInt(card)
        }
    }

    if (aces > 0) {
        for (let i = 0; i < aces; i++) {
            if (aces > 1) {
                total = total + 1
            } else {
                if (total <= 10) {
                    total = total + 11
                    aceAs11 = true
                } else {
                    total = total + 1
                }
            }
        }
    }

    if (total > 21) {
        if (aceAs11) {
            total = total - 10
        }
    }

    return total
}

function getCards(member) {
    const cards = games.get(member.user.id).cards

    let message = ""
    
    for (let card of cards) {
        message = message + "| " + card + " "
    }

    return message.substr(1)
}

function getDealerCards(member) {
    const cards = games.get(member.user.id).dealerCards

    let message = ""
    
    for (let card of cards) {
        message = message + "| " + card + " "
    }

    return message.substr(1)
}

async function playGame(message, m) {

    if (!games.has(message.author.id)) return

    let bet = games.get(message.member.user.id).bet
    const first = games.get(message.member.user.id).first
    const dealerPlaya = games.get(message.member.user.id).dealerPlay

    const newEmbed = new CustomEmbed(message.member, true, "**bet** $" + bet.toLocaleString())
        .setTitle("blackjack | " + message.member.user.username)

    const lose = async () => {
        newEmbed.setColor("#e4334f")
        newEmbed.setDescription("**bet** $" + bet.toLocaleString() + "\n\n**you lose!!**")
        newEmbed.addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**")
        newEmbed.addField(message.member.user.tag, getCards(message.member) + " **" + calcTotal(message.member) + "**")
        games.delete(message.author.id)
        await m.edit(newEmbed)
        return m.reactions.removeAll()
    }

    const win = async () => {

        let winnings = bet * 2

        newEmbed.setColor("#5efb8f")
        if (games.get(message.member.user.id).voted > 0) {
            winnings = winnings + Math.round(winnings * games.get(message.member.user.id).voted)

            if (bet >= 10000) {
                const xpBonus = Math.floor(Math.random() * 2) + getPrestige(message.member) + 1
                updateXp(message.member, getXp(message.member) + xpBonus)
                newEmbed.setFooter("+" + xpBonus + "xp")
            }

            newEmbed.setDescription("**bet** $" + bet.toLocaleString() + 
                "\n\n**winner!!**\n**you win** $" + winnings.toLocaleString() + "\n" +
                "+**" + (games.get(message.member.user.id).voted * 100).toString() + "**% bonus")
        } else {
            newEmbed.setDescription("**bet** $" + bet.toLocaleString() + 
                "\n\n**winner!!**\n**you win** $" + winnings.toLocaleString())
        }
        
        newEmbed.addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**")
        newEmbed.addField(message.member.user.tag, getCards(message.member) + " **" + calcTotal(message.member) + "**")
        updateBalance(message.member, getBalance(message.member) + winnings)
        games.delete(message.author.id)
        await m.edit(newEmbed)
        return m.reactions.removeAll()
    }

    const draw = async () => {
        newEmbed.setColor("#E5FF00")
        newEmbed.setDescription("**bet** $" + bet.toLocaleString() + "\n\n**draw!!**\nyou win $" + bet.toLocaleString())
        newEmbed.addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**")
        newEmbed.addField(message.member.user.tag, getCards(message.member) + " **" + calcTotal(message.member) + "**")
        updateBalance(message.member, getBalance(message.member) + bet)
        games.delete(message.author.id)
        await m.edit(newEmbed)
        return m.reactions.removeAll()
    }
    
    if (calcTotalDealer(message.member) > 21) {
        return win()
    } else if (calcTotalDealer(message.member) == 21 && !first && dealerPlaya) {
        return lose()
    } else if (calcTotal(message.member) == 21) {
        return setTimeout(() => {
            dealerPlay(message)

            if (calcTotal(message.member) == calcTotalDealer(message.member)) {
                return draw()
            } else if (calcTotalDealer(message.member) > 21) {
                return win()
            } else if (calcTotalDealer(message.member) == 21) {
                return lose()
            } else if (calcTotal(message.member) == 21) {
                return win()
            } else {
                if (calcTotal(message.member) > calcTotalDealer(message.member)) {
                    return win()
                } else {
                    return lose()
                }
            }
        }, 1500)
    } else if (calcTotal(message.member) > 21) {
        return lose()
    } else {
        if (!first) {
            await m.reactions.cache.get("1️⃣").users.remove(message.member)
        }

        games.set(message.member.user.id, {
            bet: bet,
            deck: games.get(message.member.user.id).deck,
            cards: games.get(message.member.user.id).cards,
            dealerCards: games.get(message.member.user.id).dealerCards,
            id: games.get(message.member.user.id).id,
            first: false,
            dealerPlay: false,
            voted: games.get(message.member.user.id).voted
        })

        let filter

        if (getBalance(message.member) >= bet) {
            filter = (reaction, user) => {
                return ["1️⃣", "2️⃣", "3️⃣"].includes(reaction.emoji.name) && user.id == message.member.user.id
            }
        } else {
            filter = (reaction, user) => {
                return ["1️⃣", "2️⃣"].includes(reaction.emoji.name) && user.id == message.member.user.id
            }
        }

        let fail = false

        const reaction = await m.awaitReactions(filter, { max: 1, time: 30000, errors: ["time"] })
            .then(collected => {
                return collected.first().emoji.name
            }).catch(() => {
                fail = true
                games.delete(message.author.id)
                return message.channel.send(message.author.toString() + " blackjack game expired")
            })

        if (fail) return

        if (reaction == "1️⃣") {
            newCard(message.member)

            if (calcTotal(message.member) > 21) {
                return lose()
            }

            const newEmbed1 = new CustomEmbed(message.member, true, message.member.user.toString() + "\n\n**bet** $" + bet.toLocaleString())
                .setTitle("blackjack")
                .addField("dealer", games.get(message.member.user.id).dealerCards[0])
                .addField(message.member.user.tag, getCards(message.member) + " **" + calcTotal(message.member) + "**")
            await m.edit(newEmbed1)

            if (calcTotal(message.member) == 21) {
                return setTimeout(() => {
                    dealerPlay(message)
    
                    if (calcTotal(message.member) == calcTotalDealer(message.member)) {
                        return draw()
                    } else if (calcTotalDealer(message.member) > 21) {
                        return win()
                    } else if (calcTotalDealer(message.member) == 21) {
                        return lose()
                    } else if (calcTotal(message.member) == 21) {
                        return win()
                    } else {
                        if (calcTotal(message.member) > calcTotalDealer(message.member)) {
                            return win()
                        } else {
                            return lose()
                        }
                    }
                }, 1500)
            }

            return playGame(message, m)

        } else if (reaction == "2️⃣") {
            const newEmbed1 = new CustomEmbed(message.member, true, message.member.user.toString() + "\n\n**bet** $" + bet.toLocaleString())
                .setTitle("blackjack")
                .addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**")
                .addField(message.member.user.tag, getCards(message.member) + " **" + calcTotal(message.member) + "**")
            m.edit(newEmbed1)

            games.set(message.member.user.id, {
                bet: bet,
                deck: games.get(message.member.user.id).deck,
                cards: games.get(message.member.user.id).cards,
                dealerCards: games.get(message.member.user.id).dealerCards,
                id: games.get(message.member.user.id).id,
                first: false,
                dealerPlay: true,
                voted: games.get(message.member.user.id).voted
            })
            
            setTimeout(() => {
                dealerPlay(message)

                if (calcTotal(message.member) == calcTotalDealer(message.member)) {
                    return draw()
                } else if (calcTotalDealer(message.member) > 21) {
                    return win()
                } else if (calcTotalDealer(message.member) == 21) {
                    return lose()
                } else if (calcTotal(message.member) == 21) {
                    return win()
                } else {
                    if (calcTotal(message.member) > calcTotalDealer(message.member)) {
                        return win()
                    } else {
                        return lose()
                    }
                }
            }, 1500)

        } else if (reaction == "3️⃣") {

            updateBalance(message.member, getBalance(message.member) - bet)

            bet = bet * 2

            games.set(message.member.user.id, {
                bet: bet,
                deck: games.get(message.member.user.id).deck,
                cards: games.get(message.member.user.id).cards,
                dealerCards: games.get(message.member.user.id).dealerCards,
                id: games.get(message.member.user.id).id,
                first: false,
                dealerPlay: false,
                voted: games.get(message.member.user.id).voted
            })

            newCard(message.member)

            const newEmbed1 = new CustomEmbed(message.member, true, message.member.user.toString() + "\n\n**bet** $" + bet.toLocaleString())
                .setTitle("blackjack")
                .addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**")
                .addField(message.member.user.tag, getCards(message.member) + " **" + calcTotal(message.member) + "**")
            m.edit(newEmbed1)


            if (calcTotal(message.member) > 21) {
                return setTimeout(() => {
                    return lose()
                }, 1500)
            }

            setTimeout(() => {
                dealerPlay(message)

                if (calcTotal(message.member) == calcTotalDealer(message.member)) {
                    return draw()
                } else if (calcTotalDealer(message.member) > 21) {
                    return win()
                } else if (calcTotalDealer(message.member) == 21) {
                    return lose()
                } else if (calcTotal(message.member) == 21) {
                    return win()
                } else {
                    if (calcTotal(message.member) > calcTotalDealer(message.member)) {
                        return win()
                    } else {
                        return lose()
                    }
                }
            }, 1500)

        } else {
            games.delete(message.author.id)
            return m.reactions.removeAll()
        }
    }
}

function dealerPlay(message) {

    if (calcTotalDealer(message.member) >= 17) {
        return
    }

    while (calcTotalDealer(message.member) < 17 && calcTotalDealer(message.member) <= calcTotal(message.member) && calcTotalDealer(message.member) < 21) {
        newDealerCard(message.member)
    }
    return 
}