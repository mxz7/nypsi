const { getBalance, createUser, updateBalance, userExists, getMember, formatBet } = require("../utils.js")
const { RichEmbed } = require("discord.js")
const shuffle = require("shuffle-array")
const Discord = require("discord.js");

var cooldown = new Set();

var waiting = new Discord.Collection();


module.exports = {
    name: "coinflip",
    description: "flip a coin, double or nothing",
    category: "money",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            message.delete().catch();
            return message.channel.send("❌\nstill on cooldown").then(m => m.delete(1000));
        }

        if (!userExists(message.member)) {
            createUser(message.member)
        }

        if (args.length == 1) {

            if (args[0].toLowerCase() == "accept") {
                if (waiting.get(message.member.user.id)) {
    
                    if (!getMember(message, waiting.get(message.member.user.id).challenger)) return
    
                    const challenger = getMember(message, waiting.get(message.member.user.id).challenger)
                    const bet = waiting.get(message.member.user.id).bet
                    const choice = waiting.get(message.member.user.id).choice
    
                    waiting.delete(message.member.user.id)
    
                    if (getBalance(challenger) < bet || getBalance(message.member) < bet) {
                        return message.channel.send("❌\nerror placing bets")
                    }
    
                    updateBalance(challenger, getBalance(challenger) - bet)
                    updateBalance(message.member, getBalance(message.member) - bet)
    
                    const lols = ["heads", "tails"]
    
                    const choice1 = shuffle(lols)[Math.floor(Math.random() * lols.length)]
            
                    let winner
                    let loser
    
                    let color;
            
                    if (message.member.displayHexColor == "#000000") {
                        color = "#FC4040";
                    } else {
                        color = message.member.displayHexColor;
                    }
    
            
                    if (choice == choice1) {
                        winner = challenger.user.tag
                        color = challenger.displayHexColor
                        loser = message.member.user.tag
                        updateBalance(challenger, getBalance(challenger) + (bet * 2))
                    } else {
                        winner = message.member.user.tag
                        color = message.member.displayHexColor
                        loser = challenger.user.tag
                        updateBalance(message.member, getBalance(message.member) + (bet * 2))
                    }
                    
                    let choice2
    
                    if (choice == "heads") {
                        choice2 = "tails"
                    } else {
                        choice2 = "heads"
                    }
            
            
                    let embed = new RichEmbed()
                        .setColor(color)
                        .setTitle("coinflip")
                        .setDescription("*throwing..* " + "\n\n" + 
                            "**" + challenger.user.tag + "** " + choice + "\n" +
                            "**" + message.member.user.tag + "** " + choice2 + "\n\n" +
                            "**bet** $" + bet.toLocaleString())
            
                        .setFooter(challenger.user.tag + " | bot.tekoh.wtf", challenger.user.avatarURL)
                        .setTimestamp();
                    
                    message.channel.send(embed).then(m => {
            
                        embed.setDescription("**threw** " + choice1 + "\n\n" + 
                            "**" + challenger.user.tag + "** " + choice + "\n" +
                            "**" + message.member.user.tag + "** " + choice2 + "\n\n" +
                            "**bet** $" + bet.toLocaleString())
                
                        setTimeout(() => {
                            m.edit(embed).then(() => {
    
                                embed.addField("**winner**", winner + " +$" + bet.toLocaleString())
                                embed.addField("**loser**", loser)
    
                                setTimeout(() => {
                                    m.edit(embed)
                                }, 1000)
                            })
                        }, 1500)
                
                
                    }).catch(() => {
                        return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
                    });
                    return
                }
            }

        }

        if (args.length != 2 && args.length != 3) {
            return message.channel.send("❌\n$coinflip <h/t> <bet> | $coinflip <user> <h/t> <bet>")
        }

        if (args.length == 3) {

            const target = message.mentions.members.first()

            if (!target) {
                return message.channel.send("❌\ninvalid user");
            }

            if (args[1].toLowerCase() == "t") args[1] = "tails"

            if (args[1].toLowerCase() == "h") args[1] = "heads"

            if (args[1].toLowerCase() != "tails" && args[1].toLowerCase() != "heads") {
                return message.channel.send("❌\n$coinflip <h/t> <bet> | $coinflip <user> <h/t> <bet>")
            }

            if (args[2] == "all") {
                args[2] = getBalance(message.member)
            }
    
            if (args[2] == "half") {
                args[2] = getBalance(message.member) / 2
            }
    
            if (isNaN(args[2]) || parseInt(args[2]) <= 0) {
                if (!isNaN(formatBet(args[2]) || !parseInt(formatBet[args[2]]))) {
                    args[2] = formatBet(args[2])
                } else {
                    return message.channel.send("❌\n$coinflip <h/t> <bet> | $coinflip <user> <h/t> <bet>")
                }
            }

            const bet = (parseInt(args[2]));

            if (bet > getBalance(message.member)) {
                return message.channel.send("❌\nyou cannot afford this bet")
            }

            if (!userExists(target)) createUser(target)

            if (bet > getBalance(target)) {
                return message.channel.send("❌\nthey cannot afford this bet")
            }

            if (waiting.get(target.user.id)) {
                return message.channel.send("❌\nthey have already been invited to a game")
            }

            cooldown.add(message.member.id);

            setTimeout(() => {
                cooldown.delete(message.member.id);
            }, 30000);

            const id = Math.random()

            const obj = {
                challenger: message.member.user.id,
                choice: args[1].toLowerCase(),
                bet: bet,
                id: id
            }

            waiting.set(target.user.id, obj)

            setTimeout(() => {
                if (waiting.get(target.user.id) && waiting.get(target.user.id).id == id && waiting.get(target.user.id).challenger == message.member.user.id && waiting.get(target.user.id).choice == args[1].toLowerCase() && waiting.get(target.user.id).bet == bet) {
                    waiting.delete(target.user.id)
                    message.channel.send(target + " game expired")
                }
            }, 15000)

            return message.channel.send(target + " you have received a coinflip challenge from " + message.member + " worth $" + bet.toLocaleString() + "\nyou have 15 seconds to accept with $cf accept")

        }

        if (args[0].toLowerCase() == "t") args[0] = "tails"

        if (args[0].toLowerCase() == "h") args[0] = "heads"

        if (args[0].toLowerCase() != "tails" && args[0].toLowerCase() != "heads") {
            return message.channel.send("❌\n$coinflip <h/t> <bet> | $coinflip <user> <h/t> <bet>")
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
                return message.channel.send("❌\n$coinflip <h/t> <bet> | $coinflip <user> <h/t> <bet>")
            }
        }

        const bet = (parseInt(args[1]));

        if (bet > getBalance(message.member)) {
            return message.channel.send("❌\nyou cannot afford this bet")
        }

        cooldown.add(message.member.id);

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        updateBalance(message.member, getBalance(message.member) - bet)

        const lols = ["heads", "tails"]

        const choice = shuffle(lols)[Math.floor(Math.random() * lols.length)]

        let win = false

        if (args[0] == choice) {
            win = true
            updateBalance(message.member, getBalance(message.member) + (bet * 2))
        }

        delete lols
        delete choice

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }


        let embed = new RichEmbed()
            .setColor(color)
            .setTitle("coinflip")
            .setDescription("*throwing..*" + "\n\n" + 
                "**side** " + args[0].toLowerCase() + "\n" +
                "**bet** $" + bet.toLocaleString())

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();
        
        message.channel.send(embed).then(m => {

            embed.setDescription("**threw** " + choice + "\n\n" + 
                "**side** " + args[0].toLowerCase() + "\n" +
                "**bet** $" + bet.toLocaleString())
            
            if (win) {
                embed.addField("**winner!!**", "**you win** $" + (bet * 2).toLocaleString())
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
    }
}