const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { userExists, createUser, getInventory, getItems, addItemUse } = require("../utils/economy/utils")
const { isPremium } = require("../utils/premium/utils")

const cmd = new Command("smelt", "smelt your ores into ingots with coal", categories.MONEY)

const cooldown = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!userExists(message.member)) createUser(message.member)

    let cooldownLength = 600

    if (isPremium(message.author.id)) {
        cooldownLength = 300
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

    let hasFurnace = false
    let coal = 0
    const ores = []

    if (inventory["furnace"] && inventory["furnace"] > 0) {
        hasFurnace = true
    }

    if (!hasFurnace) {
        return message.channel.send({
            embeds: [new ErrorEmbed("you need a furnace to smelt ore. furnaces can be found in crates")],
        })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    addItemUse(message.member, "furnace")

    if (inventory["iron_ore"] && inventory["iron_ore"] > 0) {
        for (let i = 0; i < inventory["iron_ore"]; i++) {
            ores.push("iron_ore")
            if (ores.length >= 64) break
        }
    }

    if (inventory["gold_ore"] && inventory["gold_ore"] > 0 && ores.length < 64) {
        for (let i = 0; i < inventory["gold_ore"]; i++) {
            ores.push("gold_ore")
            if (ores.length >= 64) break
        }
    }

    if (ores.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("you ore to smelt. ore can be found in crates and through mining")] })
    }

    if (inventory["coal"] && inventory["coal"] > 0) {
        coal = inventory["coal"]

        if (coal > ores.length) coal = ores.length
    }

    if (coal == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("you need coal to smelt ore. coal can be found in crates and through mining")] })
    }

    const smelted = new Map()

    for (const ore of ores) {
        if (smelted.has(ore)) {
            smelted.set(ore, smelted.get(ore) + 1)
        } else {
            smelted.set(ore, 1)
        }
    }

    let res = ""

    for (const ore of Array.from(smelted.keys())) {
        inventory[ore] -= smelted.get(ore)

        if (inventory[ore] <= 0) delete inventory[ore]

        const ingot = items[ore].ingot

        res += `\n${smelted.get(ore)} ${items[ingot].emoji} ${items[ingot].name}`

        if (inventory[ingot]) {
            inventory[ingot] += smelted.get(ore)
        } else {
            inventory[ingot] = smelted.get(ore)
        }
    }

    inventory["coal"] -= coal
    inventory["furnace"] -= 1

    if (inventory["coal"] <= 0) delete inventory["coal"]
    if (inventory["furnace"] <= 0) delete inventory["furnace"]

    const embed = new CustomEmbed(message.member, false)
    embed.setTitle(`furnace | ${message.author.username}`)
    embed.setDescription("<:nypsi_furnace_lit:959445186847584388> smelting...")

    const msg = await message.channel.send({ embeds: [embed] })
    
    setTimeout(() => {
        embed.setDescription(`<:nypsi_furnace:959445132585869373> you have smelted: \n${res}`)
    }, 2000)

}

cmd.setRun(run)

module.exports = cmd
