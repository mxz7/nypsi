const { getBalance, createUser, updateBalance, userExists, formatBet, getVoteMulti } = require("../utils.js")
const { RichEmbed } = require("discord.js")
const shuffle = require("shuffle-array")

var cooldown = new Map()

module.exports = {
    name: "rockpaperscissors",
    description: "play rock paper scissors",
    category: "money",
    run: async (message, args) => {

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
            return message.channel.send("❌\nstill on cooldown for " + remaining );
        }

        if (!userExists(message.member)) {
            createUser(message.member)
        }

        if (args.length == 0 || args.length == 1) {
            return message.channel.send("❌\n$rps <**r**ock/**p**aper/**s**cissors> <bet>")
        }

        let choice = args[0]

        if (choice != "rock" && choice != "paper" && choice != "scissors" && choice != "r" && choice != "p" && choice != "s") {
            return message.channel.send("❌\n$rps <**r**ock/**p**aper/**s**cissors> <bet>")
        }

        if (choice == "r") choice = "rock"
        if (choice == "p") choice = "paper"
        if (choice == "s") choice = "scissors"

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
                return message.channel.send("❌\n$rps <**r**ock/**p**aper/**s**cissors> <bet>")
            }
        }

        const bet = (parseInt(args[1]))

        if (bet <= 0) {
            return message.channel.send("❌\n$rps <**r**ock/**p**aper/**s**cissors> <bet>")
        }

        if (bet > getBalance(message.member)) {
            return message.channel.send("❌\nyou cannot afford this bet")
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

        let win = false
        let winnings = 0

        if (choice == "rock" && winning == "scissors") {
            win = true

            winnings = Math.round(bet * 2.5)
            updateBalance(message.member, getBalance(message.member) + winnings)
        } else if (choice == "paper" && winning == "rock") {
            win = true

            winnings = Math.round(bet * 2.5)
            updateBalance(message.member, getBalance(message.member) + winnings)
        } else if (choice == "scissors" && winning == "paper") {
            win = true

            winnings = Math.round(bet * 2.5)
            updateBalance(message.member, getBalance(message.member) + winnings)
        }

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new RichEmbed()
            .setColor(color)
            .setTitle("rock paper scissors")
            .setDescription("*rock..paper..scissors..* **shoot!!**\n\n**choice** " + choice + "\n**bet** $" + bet.toLocaleString())
            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();
    
        message.channel.send(embed).then(m => {

            embed.setDescription("**threw** " + winning + "\n\n**choice** " + choice + "\n**bet** $" + bet.toLocaleString())

            if (win) {
                embed.addField("**winner!!**", "**you win** $" + winnings.toLocaleString())
                embed.setColor("#31E862")
            } else {
                embed.addField("**loser!!**", "**you lost** $" + bet.toLocaleString())
                embed.setColor("#FF0000")
            }

            setTimeout(() => {
                m.edit(embed)
            }, 1500)
        }).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });

        if (win) {
            const multi = await getVoteMulti(message.member)

            if (multi > 0) {
                updateBalance(message.member, getBalance(message.member) + Math.round((multi * (bet * 2))))
            }
        }
    }
}