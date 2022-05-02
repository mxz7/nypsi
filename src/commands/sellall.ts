import { Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders")
const {
    getItems,
    getBalance,
    getInventory,
    updateBalance,
    setInventory,
    getMulti,
    userExists,
    createUser,
} = require("../utils/economy/utils")
import { isPremium } from "../utils/premium/utils"

const cmd = new Command("sellall", "sell all commonly sold items", Categories.MONEY)

cmd.slashEnabled = true

const cooldown = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message) {
    if (!userExists(message.member)) createUser(message.member)

    let cooldownLength = 10

    if (isPremium(message.author.id)) {
        cooldownLength = 2
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
        return send({ embeds: [new ErrorEmbed("you do not have anything to sell")] })
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
                return send({
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

    return send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
