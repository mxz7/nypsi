const { getColor } = require("../utils/utils")
const { getBalance, createUser, updateBalance, userExists, formatBet, getVoteMulti } = require("../economy/utils.js")
const { MessageEmbed } = require("discord.js")
const shuffle = require("shuffle-array")

const values = ["b", "b", "b", "b", "b", "b", "b", "b", "b", "r", "r", "r", "r", "r", "r", "r", "r", "r", "r", "g"]

const cooldown = new Map()

module.exports = {
    name: "roulette",
    description: "play roulette",
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
            return message.channel.send("❌ still on cooldown for " + remaining );
        }

        if (!userExists(message.member)) createUser(message.member)

        if (args.length == 1 && args[0].toLowerCase() == "odds") {
            return message.channel.send("🔴 " + ((values.length - 1) / 2) + "/" + values.length + " win **2**x\n" + 
                "⚫ " + ((values.length - 1) / 2) + "/" + values.length + " win **2**x\n" + 
                "🟢 1/" + values.length + " win **25**x")
        }

        const color = getColor(message.member);

        if (args.length != 2) {
            const embed = new MessageEmbed()
                .setTitle("roulette help")
                .setColor(color)
                .addField("usage", "$roulette <colour (**r**ed/**g**reen/**b**lack)> <bet>\n$roulette odds")
                .addField("help", "this is a bit of a simpler version of real roulette, as in you can only bet on red, black and green which mimics typical csgo roulette\n" +
                    "red and black give a **2x** win and green gives a **25**x win")
                .setFooter("bot.tekoh.wtf")

            return message.channel.send(embed).catch(() => message.channel.send("❌ $roulette <colour (**r**ed/**g**reen/**b**lack)> <bet> | $**roulette odds** shows the odds of winning"))
        }

        if (args[0] != "red" && args[0] != "green" && args[0] != "black" && args[0] != "r" && args[0] != "g" && args[0] != "b") {
            return message.channel.send("❌ $roulette <colour (**r**ed/**g**reen/**b**lack)> <bet> | $**roulette odds** shows the odds of winning")
        }

        if (args[0] == "red") {
            args[0] = "r"
        } else if (args[0] == "green") {
            args[0] = "g"
        } else if (args[0] == "black") {
            args[0] = "b"
        }

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
                return message.channel.send("❌ $roulette <colour (**r**ed/**g**reen/**b**lack)> <bet> | $**roulette odds** shows the odds of winning")
            }
        }

        const bet = parseInt(args[1])

        if (bet <= 0) {
            return message.channel.send("❌ $roulette <colour (**r**ed/**g**reen/**b**lack)> <bet> | $**roulette odds** shows the odds of winning")
        }

        if (bet > getBalance(message.member)) {
            return message.channel.send("❌ you cannot afford this bet")
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        let colorBet = args[0].toLowerCase()

        updateBalance(message.member, getBalance(message.member) - bet)

        let roll = shuffle(values)[Math.floor(Math.random() * values.length)]

        let win = false
        let winnings = 0

        if (colorBet == roll) {
            win = true
            if (roll == "g") {
                winnings = Math.round(bet * 25)
            } else {
                winnings = Math.round(bet * 2)
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
            .setTitle("roulette wheel | " + message.member.user.username)
            .setDescription("*spinning wheel..*\n\n**choice** " + colorBet + "\n**your bet** $" + bet.toLocaleString())

            .setFooter("bot.tekoh.wtf")
        
        message.channel.send(embed).then(m => {

            embed.setDescription("**landed on** " + roll + "\n\n**choice** " + colorBet + "\n**your bet** $" + bet.toLocaleString())
            
            if (win) {

                if (voted) {
                    embed.addField("**winner!!**", "**you win** $" + winnings.toLocaleString() + "\n" +
                        "+**" + (voteMulti * 100).toString() + "**% vote bonus")
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
            }, 2000)


        }).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });
    }
}