const { Message } = require("discord.js")
const { inPlaceSort } = require("fast-sort")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { getItems, getInventory, userExists, createUser } = require("../utils/economy/utils")

const cmd = new Command("cars", "view the current cars available", categories.MONEY).setAliases([
    "car",
])

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
        const time = 10 - diff

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

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 10000)

    let page = 0

    if (args.length == 1) {
        if (!parseInt(args[0])) {
            page = 1
        } else {
            page = args[0] - 1
            if (page < 0) {
                page = 0
            }
        }
    }

    if (!userExists(message.member)) createUser(message.member)

    const items = getItems()
    const inventory = getInventory(message.member)

    const itemIDs = Array.from(Object.keys(items))

    inPlaceSort(itemIDs).asc()

    const pages = []

    let pageOfItems = []
    for (const item of itemIDs) {
        if (items[item].role != "car") continue

        if (pageOfItems.length == 6) {
            pages.push(pageOfItems)
            pageOfItems = [item]
        } else {
            pageOfItems.push(item)
        }
    }

    if (pageOfItems.length != 0) {
        pages.push(pageOfItems)
    }

    const embed = new CustomEmbed(message.member).setFooter(`page ${page + 1}/${pages.length}`)

    embed.setTitle("car magazine")

    if (!pages[page]) {
        page = 0
    }

    for (let item of pages[page]) {
        let owned = false
        item = items[item]

        if (inventory[item.id] && inventory[item.id] > 0) owned = true

        embed.addField(
            item.id,
            `${item.emoji} **${item.name}**\n${item.description}\n**speed** ${item.speed}${
                owned ? "\n*owned*" : ""
            }`,
            true
        )
    }

    const msg = await message.channel.send(embed)

    if (pages.length > 1) {
        await msg.react("⬅")
        await msg.react("➡")

        let currentPage = page

        const lastPage = pages.length

        const filter = (reaction, user) => {
            return ["⬅", "➡"].includes(reaction.emoji.name) && user.id == message.member.user.id
        }

        const pageManager = async () => {
            const reaction = await msg
                .awaitReactions(filter, { max: 1, time: 30000, errors: ["time"] })
                .then((collected) => {
                    return collected.first().emoji.name
                })
                .catch(async () => {
                    await msg.reactions.removeAll()
                })

            const newEmbed = new CustomEmbed(message.member).setTitle("car magazine")

            if (!reaction) return

            if (reaction == "⬅") {
                if (currentPage <= 0) {
                    return pageManager()
                } else {
                    currentPage--
                    for (let item of pages[currentPage]) {
                        let owned = false
                        item = items[item]

                        if (inventory[item.id] && inventory[item.id] > 0) owned = true

                        newEmbed.addField(
                            item.id,
                            `${item.emoji} **${item.name}**\n${item.description}\n**speed** ${
                                item.speed
                            }${owned ? "\n*owned*" : ""}`,
                            true
                        )
                    }
                    newEmbed.setFooter(`page ${currentPage + 1}/${pages.length}`)
                    await msg.edit(newEmbed)
                    return pageManager()
                }
            } else if (reaction == "➡") {
                if (currentPage + 1 >= lastPage) {
                    return pageManager()
                } else {
                    currentPage++
                    for (let item of pages[currentPage]) {
                        let owned = false
                        item = items[item]

                        if (inventory[item.id] && inventory[item.id] > 0) owned = true

                        newEmbed.addField(
                            item.id,
                            `${item.emoji} **${item.name}**\n${item.description}\n**speed** ${
                                item.speed
                            }${owned ? "\n*owned*" : ""}`,
                            true
                        )
                    }
                    newEmbed.setFooter(`page ${currentPage + 1}/${pages.length}`)
                    await msg.edit(newEmbed)
                    return pageManager()
                }
            }
        }
        return pageManager()
    }
}

cmd.setRun(run)

module.exports = cmd
