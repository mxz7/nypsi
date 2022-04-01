const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const {
    getItems,
    formatBet,
    getBalance,
    getInventory,
    getMaxBitcoin,
    getMaxEthereum,
    updateBalance,
    setInventory,
    getMulti,
    userExists,
    createUser,
} = require("../utils/economy/utils")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium } = require("../utils/premium/utils")

const cmd = new Command("sellall", "sell all commonly sold items", categories.MONEY)

const cooldown = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!userExists(message.member)) createUser(message.member)

    let cooldownLength = 10

    if (isPremium(message.author.id)) {
        cooldownLength = 2
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

    const items = getItems()

    const inventory = getInventory(message.member)

    const selected = new Map()

    for (const item of Array.from(Object.keys(inventory))) {
        if (items[item].role == "fish" || items[item].role == "prey" || items[item].role == "sellable") {
            selected.set(item, inventory[item])
        } else if (items[item].id.includes("watch") || items[item].id == "calendar" || items[item].id == "potato") {
            selected.set(item, inventory[item])
        }
    }

    if (selected.size == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("you do not have anything to sell")] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    const multi = await getMulti(message.member)

    let total = 0
    let earned = ""

    for (const item of selected.keys()) {
        delete inventory[item]

        let sellWorth = Math.floor(items[item].worth * 0.5 * selected.get(item))

        if (items[item].role == "fish" || items[item].role == "prey" || items[item].role == "sellable") {
            sellWorth = Math.floor(sellWorth + sellWorth * multi)
        } else if (item == "ethereum" || item == "bitcoin") {
            if (!selected.worth) {
                return message.channel.send({
                    embeds: [new ErrorEmbed(`you cannot currently sell ${selected.name}`)],
                })
            }
            sellWorth = Math.floor(selected.worth * 0.95 * selected.get(item))
        }

        total += sellWorth
        earned += `\n${items[item].emoji} ${items[item].name} +$${sellWorth.toLocaleString()} (${selected.get(item)})`
    }

    setInventory(message.member, inventory)

    updateBalance(message.member, getBalance(message.member) + total)

    const embed = new CustomEmbed(message.member, false)

    embed.setDescription(`+$**${total.toLocaleString()}**\n${earned}`)

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
