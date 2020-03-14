const { getBalance, createUser, getMultiplier, updateBalance, userExists, winBoard, formatBet, getVoteMulti } = require("../utils.js")
const { RichEmbed } = require("discord.js")
const shuffle = require("shuffle-array")

var cooldown = new Map()

module.exports = {
    name: "slots",
    description: "play slots",
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

        if (bet <= 0) {
            return message.channel.send("❌\n$slots <bet> | $**slots info** shows the winning board")
        }

        if (bet > getBalance(message.member)) {
            return message.channel.send("❌\nyou cannot afford this bet")
        }

        cooldown.set(message.member.id, new Date());

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


        //Start of processing designed to make winning easier, but designed to make winning harder for rich people

        //if no win - balances smaller than 1b have a chance to win
        if (one != two) {
            if (getBalance(message.member) < 1000000000) {
                const chanceToWin = Math.floor(Math.random() * 12)
                if (chanceToWin <= 3) {
                    one = two
                }
                if (chanceToWin <= 1) {
                    three = two
                }
            }
        }

        //if 1 and 2 are equal (1.5 win) balances over 1b have 4/10 chance to lose - others have 2/10 to win
        if (one == two ** two != three) {
            if (getBalance(message.member) > 1000000000) {
                const chanceToWin = Math.floor(Math.random() * 10)

                if (chanceToWin <= 4) {
                    two = three
                } 
                
            } else {
                const chanceToWin = Math.floor(Math.random() * 10)

                if (chanceToWin <= 2) {
                    three = two
                }
            }
        }

        //if its a cherry win & balance over 1t, 7/10 chance to get melon win. balance over 1b, 6/10 for melon win. others have 2/10 for lemon win
        if (one == two && two == three && one == "🍒") {
            if (getBalance(message.member) > 1000000000) {
                const chanceToLose = Math.floor(Math.random() * 10)

                if (chanceToLose <= 7) {
                    one = "🍉"
                    two = "🍉"
                    three = "🍉"
                }
            } else if (getBalance(message.member) > 1000000) {
                const chanceToLose = Math.floor(Math.random() * 10)

                if (chanceToLose <= 6) {
                    one = "🍉"
                    two = "🍉"
                    three = "🍉"
                }
            } else {
                const chanceToLose = Math.floor(Math.random() * 10)

                if (chanceToLose <= 2) {
                    one = "🍋"
                    two = "🍋"
                    three = "🍋"
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
            }, 750)


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