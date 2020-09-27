const { getColor } = require("../utils/utils")
const { getBalance, createUser, updateBalance, userExists, formatBet, getVoteMulti, getXp, updateXp } = require("../economy/utils.js")
const { MessageEmbed, Message } = require("discord.js");
const shuffle = require("shuffle-array")

const cooldown = new Map()

module.exports = {
    name: "rockpaperscissors",
    description: "play rock paper scissors",
    category: "money",
    aliases: ["rps"],
    /**
     * @param {Message} message 
     * @param {Array<String>} args 
     */
    run: async (message, args) => {

        const color = getColor(message.member);

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 5 - diff

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

        if (!userExists(message.member)) {
            createUser(message.member)
        }

        if (args.length == 0 || args.length == 1) {
            const embed = new MessageEmbed()
                .setTitle("rockpaperscissors help")
                .setColor(color)
                .setFooter("bot.tekoh.wtf")
                .addField("usage", "$rps <**r**ock/**p**aper/**s**cissors> <bet>")
                .addField("help", "rock paper scissors works exactly how this game does in real life\n" +
                    "**2**x multiplier for winning")


            return message.channel.send(embed).catch(() => message.channel.send("❌ $rps <**r**ock/**p**aper/**s**cissors> <bet>"))
        }

        let choice = args[0]
        let memberEmoji = ""

        if (choice != "rock" && choice != "paper" && choice != "scissors" && choice != "r" && choice != "p" && choice != "s") {
            return message.channel.send("❌ $rps <**r**ock/**p**aper/**s**cissors> <bet>")
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
                return message.channel.send("❌ $rps <**r**ock/**p**aper/**s**cissors> <bet>")
            }
        }

        const bet = (parseInt(args[1]))

        if (!bet) {
            return message.channel.send("❌ $rps <**r**ock/**p**aper/**s**cissors> <bet>")
        }

        if (bet <= 0) {
            return message.channel.send("❌ $rps <**r**ock/**p**aper/**s**cissors> <bet>")
        }

        if (bet > getBalance(message.member)) {
            return message.channel.send("❌ you cannot afford this bet")
        }

        if (bet > 150000) {
            return message.channel.send("❌ maximum bet is $**150k**")
        }

        cooldown.set(message.member.id, new Date())

        setTimeout(() => {
            cooldown.delete(message.member.id)
        }, 5000)

        updateBalance(message.member, getBalance(message.member) - bet)

        const values = ["rock", "paper", "scissors"]

        const index = values.indexOf(choice);

        if (index > -1) {
            values.splice(index, 1);
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

            winnings = Math.round(bet * 2)
            updateBalance(message.member, getBalance(message.member) + winnings)
        } else if (choice == "paper" && winning == "rock") {
            win = true

            winnings = Math.round(bet * 2)
            updateBalance(message.member, getBalance(message.member) + winnings)
        } else if (choice == "scissors" && winning == "paper") {
            win = true

            winnings = Math.round(bet * 2)
            updateBalance(message.member, getBalance(message.member) + winnings)
        }

        let voted = false
        let voteMulti = 0

        if (win) {
            voteMulti = await getVoteMulti(message.member)
    
            if (voteMulti > 0) {
                voted = true
            }

            if (voted) {
                updateBalance(message.member, getBalance(message.member), + Math.round(winnings * voteMulti))
                winnings = winnings + Math.round(winnings * voteMulti)
            }
        }

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle("rock paper scissors | " + message.member.user.username)
            .setDescription("*rock..paper..scissors..* **shoot!!**\n\n**choice** " + choice + " " + memberEmoji + "\n**bet** $" + bet.toLocaleString())
            .setFooter("bot.tekoh.wtf")
    
        message.channel.send(embed).then(m => {

            embed.setDescription("**threw** " + winning + " " + winningEmoji + "\n\n**choice** " + choice + " " + memberEmoji + "\n**bet** $" + bet.toLocaleString())

            if (win) {

                if (voted) {
                    embed.addField("**winner!!**", "**you win** $" + winnings.toLocaleString() + "\n" +
                        "+**" + (voteMulti * 100).toString() + "**% vote bonus")

                    if (bet >= 1000) {
                        const xpBonus = Math.floor(Math.random() * 2) + 1
                        updateXp(message.member, getXp(message.member) + xpBonus)
                        embed.setFooter("+" + xpBonus + "xp")
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
        }).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });
    }
}