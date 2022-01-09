const { Message, MessageButton, MessageActionRow } = require("discord.js")
const { getMember } = require("../utils/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { isKarmaShopOpen, getKarma, openKarmaShop, closeKarmaShop, removeKarma } = require("../utils/karma/utils")
const { inPlaceSort } = require("fast-sort")

const cmd = new Command("karmashop", "buy stuff with your karma", categories.INFO)

const cooldown = new Map()
const items = require("../utils/karma/items.json")

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (message.author.id == "672793821850894347") {
        if (args[0] && args[0].toLowerCase() == "open") {
            return openKarmaShop()
        } else if (args[0] && args[0].toLowerCase() == "close") {
            return closeKarmaShop()
        }
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 3 - diff

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

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 3000)

    if (!isKarmaShopOpen()) {
        const embed = new CustomEmbed(message.member, false).setTitle("karma shop")
        embed.setDescription("the karma shop is currently closed ❌")
        return message.channel.send({ embeds: [embed] })
    }

    const itemIDs = Array.from(Object.keys(items))

    if (args.length == 0) {
        inPlaceSort(itemIDs).asc((i) => items[i].cost)

        const pages = []

        let pageOfItems = []
        for (const item of itemIDs) {
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

        const page = 0

        const embed = new CustomEmbed(message.member).setFooter(`page ${page + 1}/${pages.length}`)

        embed.setTitle("karma shop | " + message.author.username)
        embed.setFooter(`you have ${getKarma(message.member)} karma`)

        for (let item of pages[page]) {
            item = items[item]
            embed.addField(
                item.id,
                `${item.emoji} **${item.name}**\n${item.description}\n**cost** ${item.cost.toLocaleString()} karma\n*${
                    item.items_left
                }* available`,
                true
            )
        }

        let row = new MessageActionRow().addComponents(
            new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
            new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY")
        )

        /**
         * @type {Message}
         */
        let msg

        if (pages.length == 1) {
            return await message.channel.send({ embeds: [embed] })
        } else {
            msg = await message.channel.send({ embeds: [embed], components: [row] })
        }

        if (pages.length > 1) {
            let currentPage = page

            const lastPage = pages.length

            const filter = (i) => i.user.id == message.author.id

            const pageManager = async () => {
                const reaction = await msg
                    .awaitMessageComponent({ filter, time: 30000, errors: ["time"] })
                    .then(async (collected) => {
                        await collected.deferUpdate()
                        return collected.customId
                    })
                    .catch(async () => {
                        await msg.edit({ components: [] })
                    })

                const newEmbed = new CustomEmbed(message.member).setTitle("karma shop | " + message.author.username)

                if (!reaction) return

                if (reaction == "⬅") {
                    if (currentPage <= 0) {
                        return pageManager()
                    } else {
                        currentPage--
                        for (let item of pages[currentPage]) {
                            item = items[item]
                            embed.addField(
                                item.id,
                                `${item.emoji} **${item.name}**\n${
                                    item.description
                                }\n**cost** ${item.cost.toLocaleString()} karma\n*${item.items_left}* available`,
                                true
                            )
                        }
                        newEmbed.setFooter(
                            `page ${currentPage + 1}/${pages.length} | you have ${getKarma(message.member)} karma`
                        )
                        if (currentPage == 0) {
                            row = new MessageActionRow().addComponents(
                                new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
                                new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
                            )
                        } else {
                            row = new MessageActionRow().addComponents(
                                new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                                new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
                            )
                        }
                        await msg.edit({ embeds: [newEmbed], components: [row] })
                        return pageManager()
                    }
                } else if (reaction == "➡") {
                    if (currentPage + 1 >= lastPage) {
                        return pageManager()
                    } else {
                        currentPage++
                        for (let item of pages[currentPage]) {
                            item = items[item]
                            embed.addField(
                                item.id,
                                `${item.emoji} **${item.name}**\n${
                                    item.description
                                }\n**cost** ${item.cost.toLocaleString()} karma\n*${item.items_left}* available`,
                                true
                            )
                        }
                        newEmbed.setFooter(
                            `page ${currentPage + 1}/${pages.length} | you have ${getKarma(message.member)} karma`
                        )
                        if (currentPage + 1 == lastPage) {
                            row = new MessageActionRow().addComponents(
                                new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                                new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(true)
                            )
                        } else {
                            row = new MessageActionRow().addComponents(
                                new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                                new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
                            )
                        }
                        await msg.edit({ embeds: [newEmbed], components: [row] })
                        return pageManager()
                    }
                }
            }
            return pageManager()
        }
    } else if (args[0].toLowerCase() == "buy") {
        let searchTag = args[1].toLowerCase()

        let selected

        for (const itemName of Array.from(Object.keys(items))) {
            const aliases = items[itemName].aliases ? items[itemName].aliases : []
            if (searchTag == itemName) {
                selected = itemName
                break
            } else if (searchTag == itemName.split("_").join("")) {
                selected = itemName
                break
            } else if (searchTag == items[itemName].name) {
                selected = itemName
                break
            }
        }

        selected = items[selected]

        if (!selected) {
            return message.channel.send({ embeds: [new ErrorEmbed(`couldnt find \`${args[1]}\``)] })
        }

        if (getKarma(message.member) < selected.cost) {
            return message.channel.send({ embeds: [new ErrorEmbed("you cannot afford this")] })
        }

        removeKarma(message.member, selected.cost)

        // add code to do after buying

        return message.channel.send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    false,
                    `you have bought ${selected.emoji} ${selected.name} for $${selected.cost.toLocaleString()}`
                ),
            ],
        })
    }
}

cmd.setRun(run)

module.exports = cmd
