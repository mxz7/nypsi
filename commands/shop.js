const { Message } = require("discord.js")
const { inPlaceSort } = require("fast-sort")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { getItems } = require("../utils/economy/utils")

const cmd = new Command(
    "shop",
    "view current items that are available to buy/sell",
    categories.MONEY
).setAliases(["store"])

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

    const items = getItems()

    const itemIDs = Array.from(Object.keys(items))

    inPlaceSort(itemIDs).asc()

    const pages = []

    let pageOfItems = []
    for (const item of itemIDs) {
        if (!items[item].worth) continue
        if (
            items[item].role == "prey" ||
            items[item].role == "fish" ||
            items[item].role == "collectable" ||
            items[item].role == "car"
        )
            continue
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

    embed.setTitle("shop | " + message.author.username)

    if (!pages[page]) {
        page = 0
    }

    for (let item of pages[page]) {
        item = items[item]
        embed.addField(
            item.id,
            `${item.emoji} **${item.name}**\n${
                item.description
            }\n**worth** $${item.worth.toLocaleString()}`,
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

            const newEmbed = new CustomEmbed(message.member).setTitle(
                "shop | " + message.author.username
            )

            if (!reaction) return

            if (reaction == "⬅") {
                if (currentPage <= 0) {
                    return pageManager()
                } else {
                    currentPage--
                    for (let item of pages[currentPage]) {
                        item = items[item]
                        newEmbed.addField(
                            item.id,
                            `${item.emoji} **${item.name}**\n${
                                item.description
                            }\n**worth** $${item.worth.toLocaleString()}`,
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
                        item = items[item]
                        newEmbed.addField(
                            item.id,
                            `${item.emoji} **${item.name}**\n${
                                item.description
                            }\n**worth** $${item.worth.toLocaleString()}`,
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
