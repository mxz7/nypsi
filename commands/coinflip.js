const { getBalance, createUser, updateBalance, userExists, formatBet, getXp, updateXp, getMulti, calcMaxBet, getPrestige } = require("../economy/utils.js")
const { Message } = require("discord.js")
const shuffle = require("shuffle-array")
const Discord = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getPrefix } = require("../guilds/utils.js")
const { getExactMember } = require("../utils/utils.js")
const { isPremium, getTier } = require("../premium/utils.js")

const cooldown = new Map()

const waiting = []

const cmd = new Command("coinflip", "flip a coin, double or nothing", categories.MONEY).setAliases(["cf"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (!userExists(message.member)) {
        createUser(message.member)
    }

    let cooldownLength = 10

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
            cooldownLength = 5
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

    if (args.length != 2) {
        const embed = new CustomEmbed(message.member, false)
            .setTitle("coinflip help")
            .addField("usage", `${prefix}coinflip <heads/tails> <bet>`)
            .addField("help", "if you win, you will double your bet")
            .addField("example", `${prefix}coinflip heads 100\n${prefix}coinflip @user 100`)

        return message.channel.send(embed)
    }

    if (waiting.includes(message.author.id)) {
        return message.channel.send(new ErrorEmbed("please wait until your game has been accepted or denied"))
    }

    if (args[0].toLowerCase() == "t") args[0] = "tails"

    if (args[0].toLowerCase() == "h") args[0] = "heads"

    if (args[0].toLowerCase() != "tails" && args[0].toLowerCase() != "heads") {
        
        if (message.guild.id == "747056029795221513") {
            return message.channel.send(new ErrorEmbed("this has been disabled in the support server"))
        }
        
        let target

        if (!message.mentions.members.first()) {
            target = await getExactMember(message, args[0])
        } else {
            target = message.mentions.members.first()
        }

        if (!target) {
            return message.channel.send(new ErrorEmbed("unable to find that member"))
        }

        if (message.member == target) {
            return message.channel.send(new ErrorEmbed("invalid user"))
        }
    
        if (target.user.bot) {
            return message.channel.send(new ErrorEmbed("invalid user"))
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
                return message.channel.send(new ErrorEmbed(`${prefix}coinflip <h/t> <bet>`))
            }
        }
    
        const bet = (parseInt(args[1]))
    
        if (bet <= 0) {
            return message.channel.send(new ErrorEmbed(`${prefix}coinflip <h/t> <bet>`))
        }
    
        if (bet > getBalance(message.member)) {
            return message.channel.send(new ErrorEmbed("you cannot afford this bet"))
        }

        if (bet > getBalance(target)) {
            return message.channel.send(new ErrorEmbed(`**${target.user.tag}** cannot afford this bet`))
        }
    
        const maxBet = await calcMaxBet(message.member)
        const targetMaxBet = await calcMaxBet(target)
    
        if (bet > maxBet) {
            return message.channel.send(new ErrorEmbed(`your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`))
        }

        if (bet > targetMaxBet) {
            return message.channel.send(new ErrorEmbed(`**${target.user.tag}**'s max bet is too low for this bet`))
        }

        waiting.push(message.author.id)

        updateBalance(message.member, getBalance(message.member) - bet)

        const requestEmbed = new CustomEmbed(message.member, false, `**${message.author.tag}** has challenged you to a coinflip\n\n**bet** $${bet.toLocaleString()}\n\nsay 'accept' to accept the coinflip`)

        await message.channel.send(`${target.user.toString()} you have been invited to a coinflip worth $${bet.toLocaleString()}`, requestEmbed)

        const filter = m => m.author.id == target.id
        let fail = false
    
        const response = await message.channel.awaitMessages(filter, { max: 1, time: 30000, errors: ["time"] }).then(collected => {
            return collected.first().content.toLowerCase()
        }).catch(() => {
            fail = true
            waiting.splice(waiting.indexOf(message.author.id), 1)
            updateBalance(message.member, getBalance(message.member) + bet)
            return message.channel.send(message.author.toString() + " coinflip request expired")
        })
    
        if (fail) return

        if (response == "yes" || response == "y" || response == "accept") {

            if (bet > getBalance(target)) {
                return message.channel.send(new ErrorEmbed("you cannot afford this bet"))
            }

            cooldown.set(message.member.id, new Date())

            setTimeout(() => {
                cooldown.delete(message.author.id)
            }, cooldownLength * 1000)

            updateBalance(target, getBalance(target) - bet)

            const lols = ["heads", "tails"]
            const choice = shuffle(lols)[Math.floor(Math.random() * lols.length)]
            let thingy = `${message.author.username}\n${target.user.username}`

            let winner
            let loser

            if (choice == "heads") {
                winner = message.member
                loser = target
            } else {
                winner = target
                loser = message.member
            }

            updateBalance(winner, getBalance(winner) + (bet * 2))

            waiting.splice(waiting.indexOf(message.author.id), 1)

            const embed = new CustomEmbed(message.member, true, `*throwing..*\n\n${thingy}\n\n**bet** $${bet.toLocaleString()}`).setTitle("coinflip")

            return message.channel.send(embed).then(msg => {

                if (winner == message.member) {
                    thingy = `**${message.author.username}** +$${bet.toLocaleString()}\n${target.user.username}`
                } else {
                    thingy = `${message.author.username}\n**${target.user.username}** +$${bet.toLocaleString()}`
                }

                embed.setDescription(`**winner** ${winner.user.tag}\n\n${thingy}\n\n**bet** $${bet.toLocaleString()}`)
                embed.setColor(winner.displayHexColor)

                return setTimeout(() => {
                    return msg.edit(embed)
                }, 2000)
            })
        } else {
            updateBalance(message.member, getBalance(message.member) + bet)
            waiting.splice(waiting.indexOf(message.author.id), 1)
            return message.channel.send(new CustomEmbed(target, false, "✅ coinflip request denied"))
        }
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
            return message.channel.send(new ErrorEmbed(`${prefix}coinflip <h/t> <bet>`))
        }
    }

    const bet = (parseInt(args[1]))

    if (bet <= 0) {
        return message.channel.send(new ErrorEmbed(`${prefix}coinflip <h/t> <bet>`))
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

    const lols = ["heads", "tails"]

    const choice = shuffle(lols)[Math.floor(Math.random() * lols.length)]

    let win = false

    if (args[0] == choice) {
        win = true
        updateBalance(message.member, getBalance(message.member) + (bet * 2))
    }
    
    let voted = false
    let voteMulti = 0

    if (win) {
        voteMulti = await getMulti(message.member)

        if (voteMulti > 0) {
            voted = true
        }

        if (voted) {
            updateBalance(message.member, getBalance(message.member) + Math.round((bet * 2) * voteMulti))
        }
    }

    const embed = new CustomEmbed(message.member, true, "*throwing..*" + "\n\n" + 
        "**side** " + args[0].toLowerCase() + "\n" +
        "**bet** $" + bet.toLocaleString())
        .setTitle("coinflip | " + message.member.user.username)
    
    message.channel.send(embed).then(m => {

        embed.setDescription("**threw** " + choice + "\n\n" + 
            "**side** " + args[0].toLowerCase() + "\n" +
            "**bet** $" + bet.toLocaleString())
        
        if (win) {

            if (voted) {
                embed.addField("**winner!!**", "**you win** $" + Math.round(((bet * 2) + ((bet * 2) * voteMulti))).toLocaleString() + "\n" +
                    "+**" + (voteMulti * 100).toString() + "**% bonus")
                
                if (bet >= 1000) {
                    const xpBonus = Math.floor(Math.random() * 2) + getPrestige(message.member) + 1
                    updateXp(message.member, getXp(message.member) + xpBonus)
                    embed.setFooter("+" + xpBonus + "xp")
                }
            } else {
                embed.addField("**winner!!**", "**you win** $" + (bet * 2).toLocaleString())
            }

            embed.setColor("#5efb8f")
        } else {
            embed.addField("**loser!!**", "**you lost** $" + bet.toLocaleString())
            embed.setColor("#e4334f")
        }

        setTimeout(() => {
            m.edit(embed)
        }, 1500)


    })

}

cmd.setRun(run)

module.exports = cmd