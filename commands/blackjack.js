const { MessageEmbed } = require("discord.js")
const { getColor } = require("../utils/utils")
const { userExists, createUser, getBalance, updateBalance, formatBet, getVoteMulti, getXp, updateXp } = require("../economy/utils.js")
const shuffle = require("shuffle-array")

const cooldown = new Map()
const games = new Map()

module.exports = {
    name: "blackjack",
    description: "play blackjack",
    category: "money",
    aliases: ["bj"],
    run: async (message, args) => {

        if (!message.guild.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ i am lacking permission: 'EMBED_LINKS'");
        }

        if (!message.guild.me.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send("❌ i am lacking permission: 'MANAGE_MESSAGES'");
        }

        if (!userExists(message.member)) createUser(message.member)

        const color = getColor(message.member);

        if (args[0] == "status" && message.member.user.id == "672793821850894347") {
            if (args.length == 1) {
                return message.channel.send("$blackjack status <@user>")
            }
            const member = message.mentions.members.first()

            if (!member) {
                return message.channel.send("$blackjack status <@user>")
            }

            if (!games.has(member.user.id)) {
                return message.channel.send("invalid user")
            }

            const game = games.get(member.user.id)

            const embed = new MessageEmbed()
                .setTitle("blackjack status")
                .setColor(color)
                .setDescription(member)
                .addField("current hands", "dealer: " + getDealerCards(member) + " " + calcTotalDealer(member) + "\n" +
                    "user: " + getCards(member) + " " + calcTotal(member))
                .addField("deck",  game.deck.join(" **|** "))
                .addField("next card", game.deck[0])
            
            return message.channel.send(embed)
        }

        if (games.has(message.member.user.id)) {
            return message.channel.send("❌ you are already playing blackjack")
        }

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 30 - diff

            const minutes = Math.floor(time / 60)
            const seconds = time - minutes * 60

            let remaining

            if (minutes != 0) {
                remaining = `${minutes}m${seconds}s`
            } else {
                remaining = `${seconds}s`
            }
            return message.channel.send(new MessageEmbed().setDescription("❌ still on cooldown for " + remaining).setColor(color));
        }

        if (args.length == 0) {
            const embed = new MessageEmbed()
                .setTitle("blackjack help")
                .setColor(color)
                .addField("usage", "$blackjack <bet>\n$blackjack info")
                .addField("game rules", "in blackjack, the aim is to get **21**, or as close as to **21** as you can get without going over\n" +
                    "the dealer will always stand on or above **17**\n" +
                    "**2**x multiplier for winning, on a draw you receive your bet back")
                .addField("help", "1️⃣ **hit** receive a new card\n" + 
                    "2️⃣ **stand** end your turn and allow the dealer to play\n" + 
                    "3️⃣ **double down** take one more card and double your bet")
                .setFooter("bot.tekoh.wtf")

            return message.channel.send(embed).catch(() => message.channel.send("❌ $blackjack <bet>"))
        }

        if (args[0] == "info") {
            const embed = new MessageEmbed()
                .setTitle("blackjack help")
                .setColor(color)
                .addField("technical info", "blackjack works exactly how it would in real life\n" +
                    "when you create a game, a full 52 deck is shuffled in a random order\n" +
                    "for every new card you take, it is taken from the first in the deck (array) and then removed from the deck\n" +
                    "view the code for this [here](https://github.com/tekohxd/nypsi/blob/master/commands/blackjack.js#L128)")
                .setFooter("bot.tekoh.wtf")
            
            return message.channel.send(embed).catch()
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
            return message.channel.send("❌ invalid bet")
        }

        const bet = parseInt(args[0])

        if (bet <= 0) {
            return message.channel.send("❌ $blackjack <bet>")
        }

        if (bet > getBalance(message.member)) {
            return message.channel.send("❌ you cannot afford this bet")
        }

        if (bet > 500000) {
            return message.channel.send("❌ maximum bet is $**500k**")
        }

        cooldown.set(message.member.id, new Date())

        setTimeout(() => {
            cooldown.delete(message.member.id)
        }, 30000)

        updateBalance(message.member, getBalance(message.member) - bet)

        const id = Math.random()

        const newDeck = ["A♠", "2♠", "3♠", "4♠", "5♠", "6♠", "7♠", "8♠", "9♠", "10♠", "J♠", "Q♠", "K♠", 
            "A♣", "2♣", "3♣", "4♣", "5♣", "6♣", "7♣", "8♣", "9♣", "10♣", "J♣", "Q♣", "K♣", 
            "A♥️", "2♥️", "3♥️", "4♥️", "5♥️", "6♥️", "7♥️", "8♥️", "9♥️", "10♥️", "J♥️", "Q♥️", "K♥️",
            "A♦", "2♦", "3♦", "4♦", "5♦", "6♦", "7♦", "8♦", "9♦", "10♦", "J♦", "Q♦", "K♦"]
    
        
        const voteMulti = await getVoteMulti(message.member)
        
        games.set(message.member.user.id, {
            bet: bet,
            deck: shuffle(newDeck),
            cards: [],
            dealerCards: [],
            id: id,
            first: true,
            dealerPlay: false,
            voted: voteMulti
        })

        setTimeout(() => {
            if (games.has(message.member.user.id) && games.get(message.member.user.id).id == id) {
                games.delete(message.member.user.id)
                return message.channel.send(message.member.user.toString() + " blackjack expired")
            }
        }, 120000)

        newDealerCard(message.member)
        newCard(message.member)
        newDealerCard(message.member)
        newCard(message.member)

        const loadingEmbed = new MessageEmbed()
            .setTitle("loading.. | " + message.member.user.username)
            .setFooter("bot.tekoh.wtf")
            .setColor(color)

        const embed = new MessageEmbed()
            .setTitle("blackjack | " + message.member.user.username)
            .setDescription("**bet** $" + bet.toLocaleString())
            .setColor(color)
            .addField("dealer", games.get(message.member.user.id).dealerCards[0])
            .addField(message.member.user.tag, getCards(message.member) + " **" + calcTotal(message.member) + "**")
            .setFooter("bot.tekoh.wtf")
        
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
            playGame(message, m)
        }).catch()
    }
}

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

    for (card of cards) {
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

    for (card of cards) {
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
    
    for (card of cards) {
        message = message + "| " + card + " "
    }

    return message.substr(1)
}

function getDealerCards(member) {
    const cards = games.get(member.user.id).dealerCards

    let message = ""
    
    for (card of cards) {
        message = message + "| " + card + " "
    }

    return message.substr(1)
}

async function playGame(message, m) {

    let bet = games.get(message.member.user.id).bet
    const first = games.get(message.member.user.id).first
    const dealerPlaya = games.get(message.member.user.id).dealerPlay

    const color = getColor(message.member);

    const newEmbed = new MessageEmbed()
        .setTitle("blackjack | " + message.member.user.username)
        .setColor(color)
        .setDescription("**bet** $" + bet.toLocaleString())
        .setFooter("bot.tekoh.wtf")

    const lose = async () => {
        newEmbed.setColor("#e4334f")
        newEmbed.setDescription("**bet** $" + bet.toLocaleString() + "\n\n**you lose!!**")
        newEmbed.addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**")
        newEmbed.addField(message.member.user.tag, getCards(message.member) + " **" + calcTotal(message.member) + "**")
        games.delete(message.member.user.id)
        await m.edit(newEmbed)
        return m.reactions.removeAll()
    }

    const win = async () => {

        let winnings = bet * 2

        newEmbed.setColor("#5efb8f")
        if (games.get(message.member.user.id).voted > 0) {
            winnings = winnings + Math.round(winnings * games.get(message.member.user.id).voted)

            if (bet >= 1000) {
                const xpBonus = Math.floor(Math.random() * 2) + 1
                updateXp(message.member, getXp(message.member) + xpBonus)
                newEmbed.setFooter("+" + xpBonus + "xp")
            }

            newEmbed.setDescription("**bet** $" + bet.toLocaleString() + 
                "\n\n**winner!!**\n**you win** $" + winnings.toLocaleString() + "\n" +
                "+**" + (games.get(message.member.user.id).voted * 100).toString() + "**% vote bonus")
        } else {
            newEmbed.setDescription("**bet** $" + bet.toLocaleString() + 
                "\n\n**winner!!**\n**you win** $" + winnings.toLocaleString())
        }
        
        newEmbed.addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**")
        newEmbed.addField(message.member.user.tag, getCards(message.member) + " **" + calcTotal(message.member) + "**")
        updateBalance(message.member, getBalance(message.member) + winnings)
        games.delete(message.member.user.id)
        await m.edit(newEmbed)
        return m.reactions.removeAll()
    }

    const draw = async () => {
        newEmbed.setColor("#E5FF00")
        newEmbed.setDescription("**bet** $" + bet.toLocaleString() + "\n\n**draw!!**\nyou win $" + bet.toLocaleString())
        newEmbed.addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**")
        newEmbed.addField(message.member.user.tag, getCards(message.member) + " **" + calcTotal(message.member) + "**")
        updateBalance(message.member, getBalance(message.member) + bet)
        games.delete(message.member.user.id)
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

        const reaction = await m.awaitReactions(filter, { max: 1, time: 240000, errors: ["time"] })
            .then(collected => {
                return collected.first().emoji.name
            }).catch()

        if (reaction == "1️⃣") {
            newCard(message.member)

            if (calcTotal(message.member) > 21) {
                return lose()
            }

            const newEmbed1 = new MessageEmbed()
                .setTitle("blackjack")
                .setColor(color)
                .setDescription(message.member.user.toString() + "\n\n**bet** $" + bet.toLocaleString())
                .addField("dealer", games.get(message.member.user.id).dealerCards[0])
                .addField(message.member.user.tag, getCards(message.member) + " **" + calcTotal(message.member) + "**")
                .setFooter("bot.tekoh.wtf")
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
            const newEmbed1 = new MessageEmbed()
                .setTitle("blackjack")
                .setColor(color)
                .setDescription(message.member.user.toString() + "\n\n**bet** $" + bet.toLocaleString())
                .addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**")
                .addField(message.member.user.tag, getCards(message.member) + " **" + calcTotal(message.member) + "**")
                .setFooter("bot.tekoh.wtf")
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

            const newEmbed1 = new MessageEmbed()
                .setTitle("blackjack")
                .setColor(color)
                .setDescription(message.member.user.toString() + "\n\n**bet** $" + bet.toLocaleString())
                .addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**")
                .addField(message.member.user.tag, getCards(message.member) + " **" + calcTotal(message.member) + "**")
                .setFooter("bot.tekoh.wtf")
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
            games.delete(message.member.user.id)
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