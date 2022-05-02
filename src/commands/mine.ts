import { Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders")
const { userExists, createUser, getInventory, getItems, setInventory, addItemUse } = require("../utils/economy/utils")
const { isPremium, getTier } = require("../utils/premium/utils")

const veins = new Map()

veins.set("cobblestone", [5, 7, 15, 25])
veins.set("coal", [2, 4, 5, 8])
veins.set("iron_ore", [1, 3, 7])
veins.set("gold_ore", [1, 2, 4])
veins.set("diamond", [1, 2])

const cmd = new Command("mine", "go to a cave and mine", Categories.MONEY)

cmd.slashEnabled = true

const cooldown = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | NypsiCommandInteraction & CommandInteraction) {
    if (!userExists(message.member)) createUser(message.member)

    let cooldownLength = 1800

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
            cooldownLength = 900
        }
    }

    const send = async (data) => {
        if (!(message instanceof Message)) {
            await message.reply(data)
            const replyMsg = await message.fetchReply()
            if (replyMsg instanceof Message) {
                return replyMsg
            }
        } else {
            return await message.channel.send(data)
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
        return send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    const inventory = getInventory(message.member)
    const items = getItems()

    let pickaxe

    if (inventory["diamond_pickaxe"] && inventory["diamond_pickaxe"] > 0) {
        pickaxe = "diamond_pickaxe"
    } else if (inventory["iron_pickaxe"] && inventory["iron_pickaxe"] > 0) {
        pickaxe = "iron_pickaxe"
    } else if (inventory["wooden_pickaxe"] && inventory["wooden_pickaxe"] > 0) {
        pickaxe = "wooden_pickaxe"
    }

    if (!pickaxe) {
        return send({ embeds: [new ErrorEmbed("you need a pickaxe to mine")] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    addItemUse(message.member, pickaxe)

    const mineItems = Array.from(Object.keys(items))

    inventory[pickaxe]--

    if (inventory[pickaxe] <= 0) {
        delete inventory[pickaxe]
    }

    setInventory(message.member, inventory)

    let times = 2

    if (pickaxe == "iron_pickaxe") {
        times = 3
    } else if (pickaxe == "diamond_pickaxe") {
        times = 4
    }

    for (let i = 0; i < 13; i++) {
        mineItems.push("nothing")
    }

    const foundItems = []

    for (let i = 0; i < times; i++) {
        const mineItemsModified = []

        for (const i of mineItems) {
            if (items[i]) {
                if (
                    items[i].id != "cobblestone" &&
                    items[i].id != "coal" &&
                    items[i].id != "diamond" &&
                    items[i].role != "ore"
                )
                    continue
                if (items[i].rarity == 4) {
                    const chance = Math.floor(Math.random() * 15)
                    if (chance == 4 && pickaxe == "diamond_pickaxe") {
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                    }
                } else if (items[i].rarity == 3) {
                    const chance = Math.floor(Math.random() * 3)
                    if (chance == 2 && pickaxe != "wooden_pickaxe") {
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                    }
                } else if (items[i].rarity == 2 && pickaxe != "wooden_pickaxe") {
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                } else if (items[i].rarity == 1) {
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                    mineItemsModified.push(i)
                } else if (items[i].rarity == 0) {
                    if (pickaxe == "diamond_pickaxe") {
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                    } else {
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                        mineItemsModified.push(i)
                    }
                }
            }
        }

        const chosen = mineItemsModified[Math.floor(Math.random() * mineItemsModified.length)]

        if (chosen == "nothing") continue

        let amount = 1

        if (veins.has(chosen)) {
            amount = veins.get(chosen)[Math.floor(Math.random() * veins.get(chosen).length)] * (times - 1)
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
        `you go to the ${
            ["cave", "strip mine", "1x1 hole you dug", "staircase to bedrock"][Math.floor(Math.random() * 4)]
        } and swing your **${items[pickaxe].name}**`
    )

    const msg = await send({ embeds: [embed] })

    embed.setDescription(
        `you go to the ${
            ["cave", "strip mine", "1x1 hole you dug", "staircase to bedrock"][Math.floor(Math.random() * 4)]
        } and swing your **${items[pickaxe].name}**\n\nyou found${
            foundItems.length > 0 ? `: \n - ${foundItems.join("\n - ")}` : " **nothing**"
        }`
    )

    const edit = async (data, msg) => {
        if (message.interaction) {
            await message.editReply(data)
            return await message.fetchReply()
        } else {
            return await msg.edit(data)
        }
    }

    setTimeout(() => {
        edit({ embeds: [embed] }, msg)
    }, 1500)
}

cmd.setRun(run)

module.exports = cmd
