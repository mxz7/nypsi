const { Message } = require("discord.js")
const { Command, Categories } = require("../utils/models/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders")
const {
    getItems,
    getBalance,
    getInventory,
    getMaxBitcoin,
    getMaxEthereum,
    updateBalance,
    setInventory,
    userExists,
    createUser,
} = require("../utils/economy/utils")
const { getPrefix } = require("../utils/guilds/utils")

const cmd = new Command("buy", "buy items from the shop", Categories.MONEY)

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
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    if (args.length == 0) {
        return message.channel.send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    false,
                    `buy items from ${getPrefix(message.guild)}shop by using the item id or item name without spaces`
                ),
            ],
        })
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
        return message.channel.send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] })
    }

    if (
        !selected.worth ||
        selected.role == "collectable" ||
        selected.role == "prey" ||
        selected.role == "fish" ||
        selected.role == "car" ||
        selected.role == "sellable" ||
        selected.role == "ore"
    ) {
        return message.channel.send({ embeds: [new ErrorEmbed("you cannot buy this item")] })
    }

    let amount = 1

    if (args.length != 1) {
        amount = parseInt(args[1])
    }

    if (!amount) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] })
    }

    if (amount < 1) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] })
    }

    if (amount > 50) amount = 50

    if (getBalance(message.member) < selected.worth * amount) {
        return message.channel.send({ embeds: [new ErrorEmbed("you cannot afford this")] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 5000)

    if (selected.id == "bitcoin") {
        const owned = inventory["bitcoin"] || 0
        const max = getMaxBitcoin(message.member)

        if (owned + amount > max) {
            return message.channel.send({ embeds: [new ErrorEmbed("you cannot buy this much bitcoin yet")] })
        }
    } else if (selected.id == "ethereum") {
        const owned = inventory["ethereum"] || 0
        const max = getMaxEthereum(message.member)

        if (owned + amount > max) {
            return message.channel.send({ embeds: [new ErrorEmbed("you cannot buy this much ethereum yet")] })
        }
    }

    updateBalance(message.member, getBalance(message.member) - selected.worth * amount)
    inventory[selected.id] + amount

    if (inventory[selected.id]) {
        inventory[selected.id] += amount
    } else {
        inventory[selected.id] = amount
    }

    setInventory(message.member, inventory)

    return message.channel.send({
        embeds: [
            new CustomEmbed(
                message.member,
                false,
                `you have bought **${amount.toLocaleString()}** ${selected.emoji} ${selected.name} for $${(
                    selected.worth * amount
                ).toLocaleString()}`
            ),
        ],
    })
}

cmd.setRun(run)

module.exports = cmd
