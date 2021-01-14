const { Message } = require("discord.js")
const { getMember } = require("../utils/utils")
const { updateBalance, getBalance, userExists, createUser, formatBet, getBankBalance } = require("../economy/utils.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getPrefix } = require("../guilds/utils")

const tax = 0.15

const cooldown = new Map()

const cmd = new Command("pay", "give other users money", categories.MONEY).setAliases(["give"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

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

    if (message.guild.id == "747056029795221513") {
        return message.channel.send(new ErrorEmbed("this has been disabled in the support server"))
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

    let taxEnabled = false

    if (amount > getBalance(message.member)) {
        return message.channel.send(new ErrorEmbed("you cannot afford this payment"))
    }

    if (amount <= 0) {
        return message.channel.send(new ErrorEmbed("invalid payment"))
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 10000)

    updateBalance(message.member, getBalance(message.member) - amount)

    if (amount > 250000) {
        taxEnabled = true
        updateBalance(target, getBalance(target) + (amount - Math.round(amount * tax)))
    } else {
        updateBalance(target, getBalance(target) + amount)
    }

    const embed = new CustomEmbed(message.member)
        .setTitle("processing payment..")
        .addField(message.member.user.tag, "$" + (getBalance(message.member) + amount).toLocaleString() + "\n**-** $" + amount.toLocaleString())

    if (taxEnabled) {
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
            

        if (taxEnabled) {
            embed.addField(target.user.tag, "$" + getBalance(target).toLocaleString() + " (+$**" + (amount - Math.round(amount * tax)).toLocaleString() + "**)")
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