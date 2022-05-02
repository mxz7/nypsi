const {
    getBalance,
    createUser,
    updateBalance,
    userExists,
    setInventory,
    getInventory,
    addItemUse,
} = require("../utils/economy/utils.js")
const Discord = require("discord.js")
import { Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
const { isPremium, getTier } = require("../utils/premium/utils")

const cooldown = new Map()

const cmd = new Command("storerob", "attempt to rob a store for a reward", Categories.MONEY).setAliases(["shoprob"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (!userExists(message.member)) createUser(message.member)

    if (getBalance(message.member) < 1000) {
        return await message.channel.send({
            embeds: [new ErrorEmbed("you must have atleast $1k in your wallet to rob a store")],
        })
    }

    const shopWorth = new Discord.Collection()

    if (getBalance(message.member) > 100000000) {
        shopWorth.set("primark", Math.round(getBalance(message.member) * 0.0005))
        shopWorth.set("asda", Math.round(getBalance(message.member) * 0.005))
        shopWorth.set("tesco", Math.round(getBalance(message.member) * 0.002))
        shopWorth.set("morrisons", Math.round(getBalance(message.member) * 0.001))
        shopWorth.set("walmart", Math.round(getBalance(message.member) * 0.005))
        shopWorth.set("target", Math.round(getBalance(message.member) * 0.002))
        shopWorth.set("7eleven", Math.round(getBalance(message.member) * 0.001))
    } else if (getBalance(message.member) > 10000000) {
        shopWorth.set("primark", Math.round(getBalance(message.member) * 0.005))
        shopWorth.set("asda", Math.round(getBalance(message.member) * 0.05))
        shopWorth.set("tesco", Math.round(getBalance(message.member) * 0.02))
        shopWorth.set("morrisons", Math.round(getBalance(message.member) * 0.01))
        shopWorth.set("walmart", Math.round(getBalance(message.member) * 0.05))
        shopWorth.set("target", Math.round(getBalance(message.member) * 0.02))
        shopWorth.set("7eleven", Math.round(getBalance(message.member) * 0.01))
    } else if (getBalance(message.member) > 500000) {
        shopWorth.set("primark", Math.round(getBalance(message.member) * 0.05))
        shopWorth.set("asda", Math.round(getBalance(message.member) * 0.5))
        shopWorth.set("tesco", Math.round(getBalance(message.member) * 0.2))
        shopWorth.set("morrisons", Math.round(getBalance(message.member) * 0.1))
        shopWorth.set("walmart", Math.round(getBalance(message.member) * 0.5))
        shopWorth.set("target", Math.round(getBalance(message.member) * 0.2))
        shopWorth.set("7eleven", Math.round(getBalance(message.member) * 0.1))
    } else {
        shopWorth.set("primark", Math.round(getBalance(message.member) * 0.1))
        shopWorth.set("asda", Math.round(getBalance(message.member) * 0.7))
        shopWorth.set("tesco", Math.round(getBalance(message.member) * 0.4))
        shopWorth.set("morrisons", Math.round(getBalance(message.member) * 0.3))
        shopWorth.set("walmart", Math.round(getBalance(message.member) * 0.7))
        shopWorth.set("target", Math.round(getBalance(message.member) * 0.3))
        shopWorth.set("7eleven", Math.round(getBalance(message.member) * 0.3))
    }

    if (args[0] == "status") {
        let shopList = ""

        for (const shop1 of shopWorth.keys()) {
            shopList = shopList + "**" + shop1 + "** $" + shopWorth.get(shop1).toLocaleString() + "\n"
        }

        shopList = shopList + "the most you can recieve on one robbery is 90% of the store's balance"

        const embed = new CustomEmbed(message.member, false, shopList).setTitle("current store balances")

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
        const diff = Math.round((curr.getTime() - init) / 1000)
        const time = cooldownLength - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining: string

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

    const shops = Array.from(shopWorth.keys())

    const shop = shops[Math.floor(Math.random() * shops.length)]
    const amount = Math.floor(Math.random() * 85) + 5
    const caught = Math.floor(Math.random() * 15)

    let robbedAmount = 0

    let percentLost
    let amountLost

    const embed = new CustomEmbed(message.member, true, "robbing " + shop + "..").setTitle(
        "store robbery | " + message.member.user.username
    )

    const embed2 = new CustomEmbed(message.member, true, "robbing " + shop + "..").setTitle(
        "store robbery | " + message.member.user.username
    )

    if (caught <= 5) {
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

            updateBalance(message.member, getBalance(message.member) - Math.floor(amountLost * 0.25))

            embed2.addField(
                "**you were caught**",
                `thanks to your lawyer, you only lost $**${Math.floor(amountLost * 0.25).toLocaleString()}**`
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
        robbedAmount = Math.round((amount / 100) * shopWorth.get(shop))

        updateBalance(message.member, getBalance(message.member) + robbedAmount)

        embed2.addField(
            "**success!!**",
            "**you stole** $" + robbedAmount.toLocaleString() + " (" + amount + "%) from **" + shop + "**"
        )
        embed2.setColor("#5efb8f")
    }

    message.channel.send({ embeds: [embed] }).then((m) => {
        setTimeout(() => {
            m.edit({ embeds: [embed2] })
        }, 1500)
    })
}

/**
 *
 * @param {Discord.GuildMember} member
 */
function deleteStoreRobCooldown(member) {
    cooldown.delete(member.user.id)
}

cmd.deleteStoreRobCooldown = deleteStoreRobCooldown

/**
 * @returns {Boolean}
 * @param {Discord.GuildMember} member
 */
function onStoreRobCooldown(member) {
    return cooldown.has(member.user.id)
}

cmd.onStoreRobCooldown = onStoreRobCooldown

cmd.setRun(run)

module.exports = cmd
