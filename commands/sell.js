const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const {
    getItems,
    formatBet,
    getBalance,
    getInventory,
    getMaxBitcoin,
    getMaxDogecoin,
    updateBalance,
    setInventory,
    getMulti,
    userExists,
    createUser,
} = require("../utils/economy/utils")
const { getPrefix } = require("../utils/guilds/utils")

const cmd = new Command("sell", "sell items", categories.MONEY)

const cooldown = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!userExists(message.member)) createUser(message.member)

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
        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``))
    }

    if (args.length == 0) {
        return message.channel.send(
            new CustomEmbed(
                message.member,
                false,
                "sell items from your inventory\n\ncoins have a set fee of **10**% per coin, while standard items have a **50**% fee"
            )
        )
    }

    const items = getItems()
    const inventory = getInventory(message.member)

    let searchTag = args[0].toLowerCase()

    let selected

    for (const itemName of Array.from(Object.keys(items))) {
        const aliases = items[itemName].aliases ? items[itemName].aliases : []
        if (searchTag == itemName) {
            selected = itemName
            break
        } else if (searchTag == itemName.split("_").join("")) {
            selected = itemName
            break
        } else if (aliases.indexOf(searchTag) != -1) {
            selected = itemName
            break
        }
    }

    selected = items[selected]

    if (!selected) {
        return message.channel.send(new ErrorEmbed(`couldnt find \`${args[0]}\``))
    }

    if (!selected.worth || selected.role == "collectable") {
        return message.channel.send(new ErrorEmbed("you cannot sell this item"))
    }

    let amount = 1

    if (args.length != 1) {
        if (args[1].toLowerCase() == "all") {
            args[1] = inventory[selected.id]
        } else if (isNaN(args[1]) || parseInt(args[1]) <= 0) {
            if (!isNaN(formatBet(args[1]) || !parseInt(formatBet[args[1]]))) {
                args[1] = formatBet(args[1])
            }
        }
        amount = parseInt(args[1])
    }

    if (!parseInt(amount)) {
        return message.channel.send(new ErrorEmbed("invalid amount"))
    }

    if (amount < 1) {
        return message.channel.send(new ErrorEmbed("invalid amount"))
    }

    if (!amount) {
        return message.channel.send(new ErrorEmbed("invalid amount"))
    }

    if (!inventory[selected.id] || inventory[selected.id] == 0) {
        return message.channel.send(new ErrorEmbed("you dont have any " + selected.name))
    }

    if (amount > inventory[selected.id]) {
        return message.channel.send(new ErrorEmbed(`you don't have enough ${selected.name}`))
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 5000)

    inventory[selected.id] -= amount

    if (inventory[selected.id] == 0) {
        delete inventory[selected.id]
    }

    setInventory(message.member, inventory)

    let sellWorth = Math.floor(selected.worth * 0.5 * amount)

    const multi = await getMulti(message.member)

    if (selected.role == "fish" || selected.role == "prey") {
        sellWorth = Math.floor(sellWorth + sellWorth * multi)
    } else if (selected.id == "dogecoin" || selected.id == "bitcoin") {
        sellWorth = Math.floor(selected.worth * 0.9 * amount)
    }

    updateBalance(message.member, getBalance(message.member) + sellWorth)

    const embed = new CustomEmbed(message.member, false)

    embed.setDescription(
        `you sold **${amount}** ${selected.name} for $${sellWorth.toLocaleString()} ${
            multi > 0 && (selected.role == "fish" || selected.role == "prey")
                ? `(+**${Math.floor(multi * 100).toString()}**% bonus)`
                : selected.id == "bitcoin" || selected.id == "dogecoin"
                ? "(-**10**% fee)"
                : ""
        }`
    )

    return message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd
