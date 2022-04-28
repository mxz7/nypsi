const { Message, MessageActionRow, MessageButton } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { getStats, createStatsProfile } = require("../utils/economy/utils")

const cmd = new Command("stats", "view your economy stats", categories.MONEY)

const cooldown = new Map()

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 15 - diff

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
    }, 15000)

    const normalStats = () => {
        const stats = getStats(message.member)

        let gambleWins = 0
        let gambleLoses = 0

        let itemsUsed = 0

        for (const gambleStats in stats.gamble) {
            gambleWins += stats.gamble[gambleStats].wins
            gambleLoses += stats.gamble[gambleStats].lose
        }

        for (const item in stats.items) {
            itemsUsed += stats.items[item]
        }

        const embed = new CustomEmbed(message.member, true).setTitle("stats | " + message.author.username)

        embed.addField(
            "gamble",
            `**${gambleWins.toLocaleString()}** win${gambleWins == 1 ? "" : "s"}\n**${gambleLoses.toLocaleString()}** loss${
                gambleLoses == 1 ? "" : "es"
            }`,
            true
        )
        embed.addField(
            "rob",
            `**${stats.rob.wins.toLocaleString()}** win${
                stats.rob.wins == 1 ? "" : "s"
            }\n**${stats.rob.lose.toLocaleString()}** loss${stats.rob.lose == 1 ? "" : "es"}`,
            true
        )
        embed.addField("items", `**${itemsUsed.toLocaleString()}** item use${stats.padlock == 1 ? "d" : "s"}`, true)

        return message.channel.send({ embeds: [embed] })
    }

    const itemStats = async () => {
        const stats = getStats(message.member).items

        const embed = new CustomEmbed(message.member, true).setTitle("item stats | " + message.author.username)

        /**
         * @type {Map<Number, Array<String>}
         */
        const pages = new Map()

        if (Array.from(Object.keys(stats)).length > 6) {
            for (const item in stats) {
                if (pages.size == 0) {
                    pages.set(1, [item])
                } else {
                    if (pages.get(pages.size).length >= 6) {
                        pages.set(pages.size + 1, [item])
                    } else {
                        const current = pages.get(pages.size)
                        current.push(item)
                        pages.set(pages.size, current)
                    }
                }
            }
            embed.setFooter(`page 1/${pages.size}`)
        }

        for (const item in stats) {
            if (embed.fields.length >= 6) break

            embed.addField(item, `**${stats[item].toLocaleString()}** use${stats[item] > 1 ? "s" : ""}`, true)
        }

        let row = new MessageActionRow().addComponents(
            new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
            new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY")
        )

        /**
         * @type {Message}
         */
        let msg

        if (pages.size == 1) {
            return await message.channel.send({ embeds: [embed] })
        } else {
            msg = await message.channel.send({ embeds: [embed], components: [row] })
        }

        if (pages.size == 0) return

        let currentPage = 1
        const lastPage = pages.size

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

            if (!reaction) return

            const newEmbed = new CustomEmbed(message.member, false).setTitle("item stats | " + message.author.username)

            if (reaction == "⬅") {
                if (currentPage <= 1) {
                    return pageManager()
                } else {
                    currentPage--

                    for (const item of pages.get(currentPage)) {
                        newEmbed.addField(item, `**${stats[item].toLocaleString()}** use${stats[item] > 1 ? "s" : ""}`, true)
                    }

                    newEmbed.setFooter(`page ${currentPage}/${lastPage}`)
                    if (currentPage == 1) {
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
                if (currentPage >= lastPage) {
                    return pageManager()
                } else {
                    currentPage++

                    for (const item of pages.get(currentPage)) {
                        newEmbed.addField(item, `**${stats[item].toLocaleString()}** use${stats[item] > 1 ? "s" : ""}`, true)
                    }

                    newEmbed.setFooter(`page ${currentPage}/${lastPage}`)
                    if (currentPage == lastPage) {
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

    const gambleStats = () => {
        const stats = getStats(message.member).gamble

        const embed = new CustomEmbed(message.member, true).setTitle("gamble stats | " + message.author.username)

        for (const gambleStat in stats) {
            embed.addField(
                gambleStat,
                `**${stats[gambleStat].wins.toLocaleString()}** win${stats[gambleStat].wins == 1 ? "" : "s"}\n**${stats[
                    gambleStat
                ].lose.toLocaleString()}** loss${stats[gambleStat].lose == 1 ? "" : "es"}`,
                true
            )
        }

        return message.channel.send({ embeds: [embed] })
    }

    if (args.length == 0) {
        return normalStats()
    } else if (args[0].toLowerCase() == "gamble") {
        return gambleStats()
    } else if (args[0].toLowerCase() == "item" || args[0].toLowerCase() == "items") {
        return itemStats()
    } else {
        return normalStats()
    }
}

cmd.setRun(run)

module.exports = cmd
