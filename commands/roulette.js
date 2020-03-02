const { getBalance, createUser, updateBalance, userExists, formatBet } = require("../utils.js")
const { RichEmbed } = require("discord.js")
const shuffle = require("shuffle-array")

const values = ["b", "b", "b", "b", "b", "b", "b", "b", "b", "b", "r", "r", "r", "r", "r", "r", "r", "r", "r", "r", "r", "g"]

var cooldown = new Set()

module.exports = {
    name: "roulette",
    description: "play roulette",
    category: "money",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            message.delete().catch();
            return message.channel.send("❌\nstill on cooldown").then(m => m.delete(1000));
        }

        if (!userExists(message.member)) createUser(message.member)

        if (args.length == 1 && args[0].toLowerCase() == "odds") {
            return message.channel.send("🔴 " + ((values.length - 1) / 2) + "/" + values.length + " win **2**x\n" + 
                "⚫ " + ((values.length - 1) / 2) + "/" + values.length + " win **2**x\n" + 
                "🟢 1/" + values.length + " win **36**x")
        }

        if (args.length != 2) {
            return message.channel.send("❌\n$roulette <colour (**r**ed/**g**reen/**b**lack)> <bet> | $**roulette odds** shows the odds of winning")
        }

        if (args[0] != "red" && args[0] != "green" && args[0] != "black" && args[0] != "r" && args[0] != "g" && args[0] != "b") {
            return message.channel.send("❌\n$roulette <colour (**r**ed/**g**reen/**b**lack)> <bet> | $**roulette odds** shows the odds of winning")
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
                return message.channel.send("❌\n$roulette <colour (**r**ed/**g**reen/**b**lack)> <bet> | $**roulette odds** shows the odds of winning")
            }
        }

        const bet = parseInt(args[1])

        if (bet > getBalance(message.member)) {
            return message.channel.send("❌\nyou cannot afford this bet")
        }

        cooldown.add(message.member.id);

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
                winnings = Math.round(bet * 36)
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

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        let embed = new RichEmbed()
            .setColor(color)
            .setTitle("roulette wheel")
            .setDescription("*spinning wheel..*\n\n**choice** " + colorBet + "\n**your bet** $" + bet.toLocaleString())

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();
        
        message.channel.send(embed).then(m => {

            embed.setDescription("**landed on** " + roll + "\n\n**choice** " + colorBet + "\n**your bet** $" + bet.toLocaleString())
            
            if (win) {
                embed.addField("**winner!!**", "**you win** $" + winnings.toLocaleString())
                embed.setColor("#31E862")
            } else {
                embed.addField("**loser!!**", "**you lost** $" + bet.toLocaleString())
                embed.setColor("#FF0000")
            }

            setTimeout(() => {
                m.edit(embed)
            }, 2000)


        }).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });



    }
}