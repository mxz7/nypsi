const { getBalance, createUser, updateBalance, userExists } = require("../economy/utils.js")
const Discord = require("discord.js")
const { Message } = require("discord.js")
const shuffle = require("shuffle-array")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cooldown = new Map()

const cmd = new Command("bankrob", "attempt to rob a bank for a high reward", categories.MONEY)

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (!userExists(message.member)) createUser(message.member)

    if (getBalance(message.member) < 1000) {
        return await message.channel.send(new ErrorEmbed("you must have atleast $1k in your wallet to rob a bank"))
    }

    const bankWorth = new Discord.Collection()

    if (getBalance(message.member) > 500000) {
        bankWorth.set("barclays", Math.round(getBalance(message.member) * 1))
        bankWorth.set("santander", Math.round(getBalance(message.member) * 0.8))
        bankWorth.set("bankofamerica", Math.round(getBalance(message.member) * 1.25))
        bankWorth.set("lloyds", Math.round(getBalance(message.member) * 0.75))
        bankWorth.set("hsbc", Math.round(getBalance(message.member) * 0.9))
        bankWorth.set("fleeca", Math.round(getBalance(message.member) * 0.5))
        bankWorth.set("mazebank", Math.round(getBalance(message.member) * 1))
    } else {
        bankWorth.set("barclays", Math.round(getBalance(message.member) * 2))
        bankWorth.set("santander", Math.round(getBalance(message.member) * 1.7))
        bankWorth.set("bankofamerica", Math.round(getBalance(message.member) * 2.5))
        bankWorth.set("lloyds", Math.round(getBalance(message.member) * 1.5))
        bankWorth.set("hsbc", Math.round(getBalance(message.member) * 1.8))
        bankWorth.set("fleeca", Math.round(getBalance(message.member) * 1.1))
        bankWorth.set("mazebank", Math.round(getBalance(message.member) * 2))
    }

    if (args[0] == "status") {
        let bankList = ""

        for (const bank1 of bankWorth.keys()) {
            bankList = bankList + "**" + bank1 + "** $" + bankWorth.get(bank1).toLocaleString() + "\n"
        }

        bankList = bankList + "the most you can recieve on one robbery is 75% of the bank's balance"

        const embed = new CustomEmbed(message.member, false, bankList)
            .setTitle("current bank balances")
            
            
        return message.channel.send(embed)
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 600 - diff

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

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 600000)

    const banks = ["barclays", "santander", "bankofamerica", "lloyds", "hsbc", "fleeca", "mazebank"]

    const bank = shuffle(banks)[Math.floor(Math.random() * banks.length)]
    const amount = Math.floor(Math.random() * 60) + 15
    const caught = Math.floor(Math.random() * 15)

    let robberySuccess = true
    let robbedAmount = 0

    let percentLost
    let amountLost

    if (caught <= 10) {
        robberySuccess = false

        percentLost = Math.floor(Math.random() * 50) + 10
        amountLost = Math.round((percentLost / 100) * getBalance(message.member))

        updateBalance(message.member, getBalance(message.member) - amountLost)
    } else {
        robberySuccess = true

        robbedAmount = Math.round((amount / 100) * bankWorth.get(bank))
            
        updateBalance(message.member, getBalance(message.member) + robbedAmount)
    }

    const embed = new CustomEmbed(message.member, true, "robbing " + bank + "..")
        .setTitle("bank robbery | " + message.member.user.username)
        
    message.channel.send(embed).then(m => {
            
        if (robberySuccess) {
            embed.addField("**success!!**", "**you stole** $" + robbedAmount.toLocaleString() + " (" + amount + "%) from **" + bank + "**")
            embed.setColor("#5efb8f")
        } else {
            embed.addField("**you were caught**", "**you lost** $" + amountLost.toLocaleString() + " (" + percentLost + "%)")
            embed.setColor("#e4334f")
        }

        setTimeout(() => {
            m.edit(embed)
        }, 1500)
    })
}

cmd.setRun(run)

module.exports = cmd