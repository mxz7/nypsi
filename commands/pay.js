const { Message } = require("discord.js")
const { getMember } = require("../utils/utils")
const { updateBalance, getBalance, userExists, createUser, formatBet, getBankBalance, getXp, getPrestige } = require("../economy/utils.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getPrefix } = require("../guilds/utils")
const { isPremium, getTier } = require("../premium/utils")

const cooldown = new Map()

const cmd = new Command("pay", "give other users money", categories.MONEY).setAliases(["give"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    let cooldownLength = 15

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

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member) 
            .setTitle("pay help")
            .addField("usage", `${prefix}pay <user> <amount>`)
            .addField("help", "if you or the the receiving member have more than $**500k** there will be a **15**% tax deduction from the payment")

        return message.channel.send(embed)
    }

    let target = message.mentions.members.first()

    if (!target) {
        target = await getMember(message, args[0])
    }

    if (!target) {
        return message.channel.send(new ErrorEmbed("invalid user"))
    }

    if (message.member == target) {
        return message.channel.send(new ErrorEmbed("invalid user"))
    }

    if (target.user.bot) {
        return message.channel.send(new ErrorEmbed("invalid user"))
    }

    if (!userExists(target)) createUser(target)

    if (!userExists(message.member)) createUser(message.member)

    if (args[1] == "all") {
        args[1] = getBalance(message.member)
    }

    if (args[1] == "half") {
        args[1] = getBalance(message.member) / 2
    }

    if (parseInt(args[1])) {
        args[1] = formatBet(args[1])
    } else {
        return message.channel.send(new ErrorEmbed("invalid amount"))
    }

    let amount = parseInt(args[1]) 

    if (amount > getBalance(message.member)) {
        return message.channel.send(new ErrorEmbed("you cannot afford this payment"))
    }

    if (amount <= 0) {
        return message.channel.send(new ErrorEmbed("invalid payment"))
    }

    if (amount >= 200000 || (getBalance(target) + amount) >= 1000000) {
        const targetXP = getXp(target)
        const targetPrestige = getPrestige(target)

        if (targetPrestige == 0) {

            if (targetXP <= 25) {
                return message.channel.send(new ErrorEmbed("you can't pay this user that much yet"))
            } else if (targetXP <= 100) {

                if (amount >= 500000 || (getBalance(target) + amount) >= 1500000) {
                    return message.channel.send(new ErrorEmbed("you can't pay this user that much yet"))
                }
                
            } else if (targetXP <= 1000) {

                if (amount >= 1000000 || (getBalance(target) + amount) >= 2000000) {
                    return message.channel.send(new ErrorEmbed("you can't pay this user that much yet"))
                }

            } else {

                if (amount >= 5000000 || (getBalance(target) + amount) >= 10000000) {
                    return message.channel.send(new ErrorEmbed("you can't pay this user that much yet"))
                }

            }

        } else if (targetPrestige == 1) {
            if (targetXP <= 100) {

                if (amount >= 5000000 || (getBalance(target) + amount) >= 10000000) {
                    return message.channel.send(new ErrorEmbed("you can't pay this user that much yet"))
                }

            } else {
                if (amount >= 10000000 || (getBalance(target) + amount) >= 15000000) {
                    return message.channel.send(new ErrorEmbed("you can't pay this user that much yet"))
                }
            }
        } else if (targetPrestige < 4) {
            if (amount >= 15000000 || (getBalance(target) + amount) >= 50000000) {
                return message.channel.send(new ErrorEmbed("you can't pay this user that much yet"))
            }
        }
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    let tax = 0

    if (amount >= 10000000) {
        tax = 0.5
    } else if (amount >= 1000000) {
        tax = 0.4
    } else if (amount >= 500000) {
        tax = 0.3
    } else if (amount >= 250000) {
        tax = 0.2
    } else if (amount >= 100000) {
        tax = 0.1
    } 

    updateBalance(message.member, getBalance(message.member) - amount)

    if (tax > 0) {
        updateBalance(target, getBalance(target) + (amount - Math.round(amount * tax)))
    } else {
        updateBalance(target, getBalance(target) + amount)
    }

    const embed = new CustomEmbed(message.member)
        .setTitle("processing payment..")
        .addField(message.member.user.tag, "$" + (getBalance(message.member) + amount).toLocaleString() + "\n**-** $" + amount.toLocaleString())

    if (tax > 0) {
        embed.setDescription(message.member.user.toString() + " -> " + target.user.toString() + "\n**" + (tax * 100) + "**% tax")
        embed.addField(target.user.tag, "$" + (getBalance(target) - amount).toLocaleString() + "\n**+** $" + (amount - Math.round(amount * tax)).toLocaleString())
    } else {
        embed.setDescription(message.member.user.toString() + " -> " + target.user.toString())
        embed.addField(target.user.tag, "$" + (getBalance(target) - amount).toLocaleString() + "\n**+** $" + amount.toLocaleString())
    }

    message.channel.send(embed).then(m => {
        const embed = new CustomEmbed(message.member)
            .setTitle("transaction success")
            .setDescription(message.member.user.toString() + " -> " + target.user.toString())
            .addField(message.member.user.tag, "$" + getBalance(message.member).toLocaleString())
            

        if (tax > 0) {
            embed.addField(target.user.tag, "$" + getBalance(target).toLocaleString() + " (+$**" + (amount - Math.round(amount * tax)).toLocaleString() + "**)")
            embed.setDescription(message.member.user.toString() + " -> " + target.user.toString() + "\n**" + (tax * 100) + "**% tax")
        } else {
            embed.addField(target.user.tag, "$" + getBalance(target).toLocaleString() + " (+$**" + amount.toLocaleString() + "**)")
        }

        
        setTimeout(() =>{
            m.edit(embed)
        }, 1500)
    })
}

cmd.setRun(run)

module.exports = cmd