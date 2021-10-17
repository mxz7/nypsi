const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const {
    userExists,
    createUser,
    getInventory,
    getItems,
    setInventory,
    getMaxBitcoin,
    getMaxDogecoin,
    updateBalance,
    getBalance,
    updateXp,
    getXp,
    addItemUse,
} = require("../utils/economy/utils")
const { isPremium, getTier } = require("../utils/premium/utils")

const cmd = new Command("hunt", "go to a field and hunt", categories.MONEY)

const cooldown = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!userExists(message.member)) createUser(message.member)

    let cooldownLength = 1800

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
            cooldownLength = 900
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

    const inventory = getInventory(message.member)
    const items = getItems()

    let gun

    if (inventory["incredible_gun"] && inventory["incredible_gun"] > 0) {
        gun = "incredible_gun"
    } else if (inventory["gun"] && inventory["gun"] > 0) {
        gun = "gun"
    } else if (inventory["terrible_gun"] && inventory["terrible_gun"] > 0) {
        gun = "terrible_gun"
    }

    if (!gun) {
        return message.channel.send({ embeds: [new ErrorEmbed("you need a gun to hunt")] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    addItemUse(message.member, gun)

    const huntItems = Array.from(Object.keys(items))

    inventory[gun]--

    if (inventory[gun] <= 0) {
        delete inventory[gun]
    }

    setInventory(message.member, inventory)

    let times = 1

    if (gun == "gun") {
        times = 2
    } else if (gun == "incredible_gun") {
        times = 3
    }

    for (let i = 0; i < 13; i++) {
        huntItems.push("nothing")
    }

    const foundItems = []

    for (let i = 0; i < times; i++) {
        const huntItemsModified = []

        for (const i of huntItems) {
            if (items[i]) {
                if (items[i].role != "prey") continue
                if (items[i].rarity == 4) {
                    const chance = Math.floor(Math.random() * 15)
                    if (chance == 4 && gun == "incredible_gun") {
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                    }
                } else if (items[i].rarity == 3) {
                    const chance = Math.floor(Math.random() * 3)
                    if (chance == 2 && gun != "terrible_gun") {
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                    }
                } else if (items[i].rarity == 2 && gun != "terrible_gun") {
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                } else if (items[i].rarity == 1) {
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                    huntItemsModified.push(i)
                } else if (items[i].rarity == 0) {
                    if (gun == "incredible_gun") {
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                    } else {
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                        huntItemsModified.push(i)
                    }
                }
            }
        }

        const chosen = huntItemsModified[Math.floor(Math.random() * huntItemsModified.length)]

        if (chosen == "nothing") continue

        let amount = 1

        if (gun == "terrible_gun") {
            amount = Math.floor(Math.random() * 2) + 1
        } else if (gun == "gun") {
            amount = Math.floor(Math.random() * 4) + 1
        } else if (gun == "incredible_gun") {
            amount = Math.floor(Math.random() * 4) + 2
        }

        if (inventory[chosen]) {
            inventory[chosen] += amount
        } else {
            inventory[chosen] = amount
        }

        foundItems.push(`${amount} ${items[chosen].emoji} ${items[chosen].name}`)
    }
    setInventory(message.member, inventory)

    const embed = new CustomEmbed(
        message.member,
        false,
        `you go to the ${["field", "forest"][Math.floor(Math.random() * 2)]} and prepare your **${items[gun].name}**`
    )

    const msg = await message.channel.send({ embeds: [embed] })

    embed.setDescription(
        `you go to the ${["field", "forest"][Math.floor(Math.random() * 2)]} and prepare your **${
            items[gun].name
        }**\n\nyou killed${foundItems.length > 0 ? `: \n - ${foundItems.join("\n - ")}` : " **nothing**"}`
    )

    setTimeout(() => {
        msg.edit({ embeds: [embed] })
    }, 1500)
}

cmd.setRun(run)

module.exports = cmd
