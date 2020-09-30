const { getBalance, createUser, updateBalance, userExists, formatBet, getVoteMulti, getXp, updateXp } = require("../economy/utils.js")
const { Message } = require("discord.js");
const shuffle = require("shuffle-array")
const Discord = require("discord.js");
const { Command, categories } = require("../utils/classes/Command");
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cooldown = new Map();

const waiting = new Discord.Collection();

const cmd = new Command("coinflip", "flip a coin, double or nothing", categories.MONEY).setAliases(["cf"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (!userExists(message.member)) {
        createUser(message.member)
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 10 - diff

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

    if (args.length != 2 && args.length != 3) {
        const embed = new CustomEmbed(message.member, false)
            .setTitle("coinflip help")
            .addField("usage", "$coinflip <heads/tails> <bet>")
            .addField("help", "with coinflip you can play against the bot or against another user\n" +
                "when playing against another user they must have enough money for the bet\n" +
                "when playing against another user you will not receive a 20% vote bonus")
            .addField("examples", "$coinflip heads 100\n$coinflip member tails 500")

        return message.channel.send(embed)
    }

    if (args[0].toLowerCase() == "t") args[0] = "tails"

    if (args[0].toLowerCase() == "h") args[0] = "heads"

    if (args[0].toLowerCase() != "tails" && args[0].toLowerCase() != "heads") {
        return message.channel.send(new ErrorEmbed("$coinflip <h/t> <bet>"))
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
            return message.channel.send(new ErrorEmbed("$coinflip <h/t> <bet>"))
        }
    }

    const bet = (parseInt(args[1]));

    if (bet <= 0) {
        return message.channel.send(new ErrorEmbed("$coinflip <h/t> <bet>"))
    }

    if (bet > getBalance(message.member)) {
        return message.channel.send(new ErrorEmbed("you cannot afford this bet"))
    }

    if (bet > 150000) {
        return message.channel.send(new ErrorEmbed("maximum bet is $**150k**"))
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.member.id);
    }, 10000);

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

    let voted = false
    let voteMulti = 0

    if (win) {
        voteMulti = await getVoteMulti(message.member)

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
                    "+**" + (voteMulti * 100).toString() + "**% vote bonus")
                
                if (bet >= 1000) {
                    const xpBonus = Math.floor(Math.random() * 2) + 1
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