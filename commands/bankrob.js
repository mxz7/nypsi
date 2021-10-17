const {
    getBalance,
    createUser,
    updateBalance,
    userExists,
    getInventory,
    setInventory,
    addItemUse,
} = require("../utils/economy/utils.js")
const Discord = require("discord.js")
const { Message } = require("discord.js")
const shuffle = require("shuffle-array")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { isPremium, getTier } = require("../utils/premium/utils")

const cooldown = new Map()

const cmd = new Command("bankrob", "attempt to rob a bank for a high reward", categories.MONEY)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!userExists(message.member)) createUser(message.member)

    if (getBalance(message.member) < 1000) {
        return await message.channel.send({
            embeds: [new ErrorEmbed("you must have atleast $1k in your wallet to rob a bank")],
        })
    }

    const bankWorth = new Discord.Collection()

    if (getBalance(message.member) > 100000000) {
        bankWorth.set("barclays", Math.round(getBalance(message.member) * 0.01))
        bankWorth.set("santander", Math.round(getBalance(message.member) * 0.008))
        bankWorth.set("bankofamerica", Math.round(getBalance(message.member) * 0.0125))
        bankWorth.set("lloyds", Math.round(getBalance(message.member) * 0.0075))
        bankWorth.set("hsbc", Math.round(getBalance(message.member) * 0.009))
        bankWorth.set("fleeca", Math.round(getBalance(message.member) * 0.005))
        bankWorth.set("mazebank", Math.round(getBalance(message.member) * 0.01))
    } else if (getBalance(message.member) > 10000000) {
        bankWorth.set("barclays", Math.round(getBalance(message.member) * 0.1))
        bankWorth.set("santander", Math.round(getBalance(message.member) * 0.08))
        bankWorth.set("bankofamerica", Math.round(getBalance(message.member) * 0.125))
        bankWorth.set("lloyds", Math.round(getBalance(message.member) * 0.075))
        bankWorth.set("hsbc", Math.round(getBalance(message.member) * 0.09))
        bankWorth.set("fleeca", Math.round(getBalance(message.member) * 0.05))
        bankWorth.set("mazebank", Math.round(getBalance(message.member) * 0.1))
    } else if (getBalance(message.member) > 500000) {
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

        const embed = new CustomEmbed(message.member, false, bankList).setTitle("current bank balances")

        return message.channel.send({ embeds: [embed] })
    }

    let cooldownLength = 600

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
            cooldownLength = 300
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
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    const banks = ["barclays", "santander", "bankofamerica", "lloyds", "hsbc", "fleeca", "mazebank"]

    const bank = shuffle(banks)[Math.floor(Math.random() * banks.length)]
    const amount = Math.floor(Math.random() * 60) + 15
    const caught = Math.floor(Math.random() * 15)

    let robbedAmount = 0

    let percentLost
    let amountLost

    const embed = new CustomEmbed(message.member, true, "robbing " + bank + "..").setTitle(
        "bank robbery | " + message.member.user.username
    )

    const embed2 = new CustomEmbed(message.member, true, "robbing " + bank + "..").setTitle(
        "bank robbery | " + message.member.user.username
    )

    if (caught <= 10) {
        percentLost = Math.floor(Math.random() * 50) + 10
        amountLost = Math.round((percentLost / 100) * getBalance(message.member))

        const inventory = getInventory(message.member)

        if (inventory["lawyer"] && inventory["lawyer"] > 0) {
            addItemUse(message.member, "lawyer")
            inventory["lawyer"]--

            if (inventory["lawyer"] == 0) {
                delete inventory["lawyer"]
            }

            setInventory(message.member, inventory)

            embed2.addField(
                "**you were caught**",
                "your lawyer stopped you from losing any money\nyou would have lost $" +
                    amountLost.toLocaleString() +
                    " (" +
                    percentLost +
                    "%)"
            )
            embed2.setColor("#e4334f")
        } else {
            updateBalance(message.member, getBalance(message.member) - amountLost)

            embed2.addField(
                "**you were caught**",
                "**you lost** $" + amountLost.toLocaleString() + " (" + percentLost + "%)"
            )
            embed2.setColor("#e4334f")
        }
    } else {
        robbedAmount = Math.round((amount / 100) * bankWorth.get(bank))

        updateBalance(message.member, getBalance(message.member) + robbedAmount)

        embed2.addField(
            "**success!!**",
            "**you stole** $" + robbedAmount.toLocaleString() + " (" + amount + "%) from **" + bank + "**"
        )
        embed2.setColor("#5efb8f")
    }

    message.channel.send({ embeds: [embed] }).then((m) => {
        setTimeout(() => {
            m.edit({ embeds: [embed2] })
        }, 1500)
    })
}

cmd.setRun(run)

module.exports = cmd
