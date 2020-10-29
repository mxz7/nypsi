const { Message } = require("discord.js");
const { userExists, createUser, getBalance, updateBalance, formatBet, getVoteMulti, getXp, updateXp } = require("../economy/utils.js")
const shuffle = require("shuffle-array");
const { Command, categories } = require("../utils/classes/Command");
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js");
const { getPrefix } = require("../guilds/utils.js");

const cooldown = new Map()
const games = new Map()

const cmd = new Command("highlow", "higher or lower game", categories.MONEY).setAliases(["hl"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (!userExists(message.member)) createUser(message.member)

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

        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``));
    }

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member)
            .setTitle("highlow help")
            .addField("usage", `${prefix}highlow <bet>\n${prefix}highlow info`)
            .addField("game rules", "you'll receive your first card and you have to predict whether the next card you pick up will be higher or lower in value than the card that you have, you can cash out after predicting correctly once.")
            .addField("help", "**A**ce | value of 1\n**J**ack | value of 11\n" + 
                "**Q**ueen | value of 12\n**K**ing | value of 13\n" +
                "⬆ **higher** the next card will be higher in value than your current card\n" +
                "⬇ **lower** the next card will be lower in value than your current card\n" +
                "💰 **cash out** end the game and receive the current win\nmax win **15**x")

        return message.channel.send(embed)
    }

    if (args[0] == "info") {
        const embed = new CustomEmbed(message.member, false, "highlow works exactly how it would in real life\n" +
            "when you create a game, a full 52 deck is shuffled in a random order\n" +
            "for every new card you take, it is taken from the first in the deck (array) and then removed from the deck\n" +
            "view the code for this [here](https://github.com/tekohxd/nypsi/blob/master/commands/highlow.js#L123)")
            .setTitle("highlow help")
        
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
        return message.channel.send(new ErrorEmbed(`${prefix}highlow <bet>`))
    }

    if (bet > getBalance(message.member)) {
        return message.channel.send(new ErrorEmbed("you cannot afford this bet"))
    }

    if (bet > 100000) {
        return message.channel.send(new ErrorEmbed("maximum bet is $**100k**"))
    }

    if (games.has(message.member.user.id)) {
        return message.channel.send(new ErrorEmbed("you are already playing highlow"))
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
        win: 0,
        deck: shuffle(newDeck),
        card: "",
        id: id,
        voted: voteMulti
    })

    newCard(message.member)

    const loadingEmbed = new CustomEmbed(message.member)
        .setTitle("loading.. | " + message.member.user.username)

    const embed = new CustomEmbed(message.member, true, "**bet** $" + bet.toLocaleString() + "\n**0**x ($0)")
        .setTitle("highlow | " + message.member.user.username)
        .addField("card", "| " + games.get(message.member.user.id).card + " |")
        .addField("help", "⬆ higher | ⬇ lower | 💰 cash out")
    
    message.channel.send(loadingEmbed).then(async m => {
        await m.react("⬆")
        await m.react("⬇")
        await m.react("💰")

        await m.edit(embed)
        playGame(message, m).catch(e => {
            console.error(e)
            return message.channel.send(new ErrorEmbed("an error occured while running - join support server"))
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
        voted: games.get(member.user.id).voted
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

async function playGame(message, m) {
    const bet = games.get(message.member.user.id).bet
    let win = games.get(message.member.user.id).win
    let card = games.get(message.member.user.id).card

    const newEmbed = new CustomEmbed(message.member, true)
        .setTitle("highlow | " + message.member.user.username)

    const lose = async () => {
        newEmbed.setColor("#e4334f")
        newEmbed.setDescription("**bet** $" + bet.toLocaleString() + "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")" + "\n\n**you lose!!**")
        newEmbed.addField("card", "| " + card + " |")
        games.delete(message.author.id)
        await m.edit(newEmbed)
        return m.reactions.removeAll()
    }

    const win1 = async () => {

        let winnings = Math.round(bet * win)

        newEmbed.setColor("#5efb8f")
        if (games.get(message.member.user.id).voted > 0) {
            winnings = winnings + Math.round(winnings * games.get(message.member.user.id).voted)

            if (bet >= 1000) {
                const xpBonus = Math.floor(Math.random() * 2) + 1
                updateXp(message.member, getXp(message.member) + xpBonus)
                newEmbed.setFooter("+" + xpBonus + "xp")
            }

            newEmbed.setDescription("**bet** $" + bet.toLocaleString() + "\n" +
                "**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")" +
                "\n\n**winner!!**\n**you win** $" + winnings.toLocaleString() + "\n" +
                "+**" + (games.get(message.member.user.id).voted * 100).toString() + "**% vote bonus")
        } else {
            newEmbed.setDescription("**bet** $" + bet.toLocaleString() + "\n" +
                "**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")" +
                "\n\n**winner!!**\n**you win** $" + winnings.toLocaleString())
        }
        newEmbed.addField("card", "| " + card + " |")
        updateBalance(message.member, getBalance(message.member) + winnings)
        games.delete(message.author.id)
        await m.edit(newEmbed)
        return m.reactions.removeAll()
    }

    const draw = async () => {
        newEmbed.setColor("#E5FF00")
        newEmbed.setDescription("**bet** $" + bet.toLocaleString() + "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")" + "\n\n**draw!!**\nyou win $" + bet.toLocaleString())
        newEmbed.addField("card", "| " + card + " |")
        updateBalance(message.member, getBalance(message.member) + bet)
        games.delete(message.author.id)
        await m.edit(newEmbed)
        return m.reactions.removeAll()
    }

    if (win == 15) {
        return win1()
    }

    const filter = (reaction, user) => {
        return ["⬆", "⬇", "💰"].includes(reaction.emoji.name) && user.id == message.member.user.id
    }

    let fail = false

    const reaction = await m.awaitReactions(filter, { max: 1, time: 30000, errors: ["time"] }).then(collected => {
        return collected.first().emoji.name
    }).catch(() => {
        fail = true
        games.delete(message.author.id)
        return message.channel.send(message.author.toString() + " highlow game expired")
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
                voted: games.get(message.member.user.id).voted
            })

            newEmbed.setDescription("**bet** $" + bet.toLocaleString() + 
                "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")")
            newEmbed.addField("card", "| " + card + " |")
            await m.reactions.cache.get("⬆").users.remove(message.member)
            await m.edit(newEmbed)
            return playGame(message, m)
        } else if (newCard1 == oldCard) {
            newEmbed.setDescription("**bet** $" + bet.toLocaleString() + 
                "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")")
            newEmbed.addField("card", "| " + card + " |")
            await m.reactions.cache.get("⬆").users.remove(message.member)
            await m.edit(newEmbed)
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
                voted: games.get(message.member.user.id).voted
            })

            newEmbed.setDescription("**bet** $" + bet.toLocaleString() + 
                "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")")
            newEmbed.addField("card", "| " + card + " |")
            await m.reactions.cache.get("⬇").users.remove(message.member)
            await m.edit(newEmbed)
            return playGame(message, m)
        } else if (newCard1 == oldCard) {
            newEmbed.setDescription("**bet** $" + bet.toLocaleString() + 
                "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")")
            newEmbed.addField("card", "| " + card + " |")
            await m.reactions.cache.get("⬇").users.remove(message.member)
            await m.edit(newEmbed)
            return playGame(message, m)
        } else {
            return lose()
        }
    } else if (reaction == "💰") {
        if (win < 1) {
            await m.reactions.cache.get("💰").users.remove(message.member)
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