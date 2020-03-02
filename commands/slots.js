const { getBalance, createUser, getMultiplier, updateBalance, userExists, winBoard, formatBet } = require("../utils.js")
const { RichEmbed } = require("discord.js")
const shuffle = require("shuffle-array")

var cooldown = new Set()

module.exports = {
    name: "slots",
    description: "play slots",
    category: "money",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            message.delete().catch();
            return message.channel.send("❌\nstill on cooldown").then(m => m.delete(1000));
        }

        if (!userExists(message.member)) {
            createUser(message.member)
        }

        if (args.length == 0) {
            return message.channel.send("❌\n$slots <bet> | $**slots info** shows the winning board")
        }

        if (args.length == 1 && args[0] == "info") {let color;

            if (message.member.displayHexColor == "#000000") {
                color = "#FC4040";
            } else {
                color = message.member.displayHexColor;
            }

            const embed = new RichEmbed()
                .setTitle("win board")
                .setDescription(winBoard() + "\nhaving any two same fruits next to eachother gives a **1.5**x win")
                .setColor(color)
                .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
                .setTimestamp();
            
            return message.channel.send(embed).catch(() => {
                return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
            })
        }

        if (!args[0]) {
            return message.channel.send("❌\n$slots <bet> | $**slots info** shows the winning board")
        }

        if (args[0] == "all") {
            args[0] = getBalance(message.member)
        }

        if (args[0] == "half") {
            args[0] = getBalance(message.member) / 2
        }

        if (isNaN(args[0]) || parseInt(args[0]) <= 0) {
            if (!isNaN(formatBet(args[0]) || !parseInt(formatBet[args[0]]))) {
                args[0] = formatBet(args[0])
            } else {
                return message.channel.send("❌\n$slots <bet> | $**slots info** shows the winning board")
            }
        }

        const bet = (parseInt(args[0]));

        if (bet > getBalance(message.member)) {
            return message.channel.send("❌\nyou cannot afford this bet")
        }

        cooldown.add(message.member.id);

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        updateBalance(message.member, getBalance(message.member) - bet)

        const values = ["🍉", "🍉", "🍉", "🍉", "🍉", "🍉", "🍉", "🍉", "🍊", "🍊", "🍊", "🍊", "🍊", "🍊", "🍊", "🍊", "🍋", "🍋", "🍋", "🍋", "🍋", "🍋", "🍋", "🍒", "🍒", "🍒", "🍒"]

        let one = shuffle(values)[Math.floor(Math.random() * values.length)]
        let two = shuffle(values)[Math.floor(Math.random() * values.length)]
        let three = shuffle(values)[Math.floor(Math.random() * values.length)]

        let win = false
        let winnings = 0


        //Start of processing designed to make winning easier, but designed to make winning harder for people with over 1T

        if (one != two && two != three) {
            if (getBalance(message.member) < 1000000000000) {
                const chanceToWin = Math.floor(Math.random() * 15)
                if (chanceToWin <= 1) {
                    one = two
                    three = two
                }
            }
        }

        if (one == two) {
            if (!getBalance(message.member) < 1000000000000) {
                const chanceToWin = Math.floor(Math.random() * 10)

                if (chanceToWin <= 1) {
                    three = two
                }
            } else {
                const chanceToWin = Math.floor(Math.random() * 10)

                if (chanceToWin <= 5) {
                    two = three
                } 
            }
        }

        if (one == two && two == three && one == "🍒") {
            const chanceToLose = Math.floor(Math.random() * 10)

            if (chanceToLose <= 4) {
                if (getBalance(message.member) < 1000000000000) {
                    one = "🍋"
                    two = "🍋"
                    three = "🍋"
                } else {
                    one = "🍉"
                    two = "🍉"
                    three = "🍉"
                }
            }
        }

        //End of processing

        if (one == two && two == three) {
            const multiplier = getMultiplier(one)

            win = true
            winnings = Math.round(multiplier * bet)

            updateBalance(message.member, getBalance(message.member) + winnings)
        } else if (one == two) {
            win = true
            winnings = Math.round(bet * 1.5)

            updateBalance(message.member, getBalance(message.member) + winnings)
        }

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        let embed = new RichEmbed()
            .setColor(color)
            .setTitle("slots")
            .setDescription(one + " | " + two + " | " + three + "\n\n**bet** $" + bet.toLocaleString())

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();
        
        message.channel.send(embed).then(m => {
            
            if (win) {
                embed.addField("**winner!!**", "**you win** $" + winnings.toLocaleString())
                embed.setColor("#31E862")
            } else {
                embed.addField("**loser!!**", "**you lost** $" + bet.toLocaleString())
                embed.setColor("#FF0000")
            }

            setTimeout(() => {
                m.edit(embed)
            }, 500)


        }).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });
    
        delete values
        delete one
        delete two
        delete three

    }
}