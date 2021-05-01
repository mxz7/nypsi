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
} = require("../utils/economy/utils")
const { getPrefix } = require("../utils/guilds/utils")

const cmd = new Command("buy", "buy items from the shop", categories.MONEY)

const cooldown = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
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
                `buy items from ${getPrefix(
                    message.guild
                )}shop by using the item id or item name without spaces`
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

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 5000)

    let amount = 1

    if (args.length != 1) {
        if (isNaN(args[1]) || parseInt(args[1]) <= 0) {
            if (!isNaN(formatBet(args[1]) || !parseInt(formatBet[args[1]]))) {
                args[1] = formatBet(args[1])
            }
        }
        amount = parseInt(args[1])
    }

    if (!parseInt(amount)) {
        return message.channel.send(new ErrorEmbed("invalid amount"))
    }

    if (!inventory[selected.id] || inventory[selected.id] == 0) {
        return message.channel.send(new ErrorEmbed("you dont have any " + selected.name))
    }

    if (amount > inventory[selected.id]) {
        return message.channel.send(new ErrorEmbed(`you don't have enough ${selected.name}`))
    }

    
}

cmd.setRun(run)

module.exports = cmd
