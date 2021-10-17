const { Message, MessageActionRow, MessageButton } = require("discord.js")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium } = require("../utils/premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")

const cooldown = new Map()

const cmd = new Command("mentions", "view who mentioned you recently", categories.UTILITY).setAliases([
    "pings",
    "whothefuckpingedme",
])

/**
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

    const { mentions } = require("../nypsi.js")

    if (!mentions.get(message.guild.id)) {
        return message.channel.send({ embeds: [new CustomEmbed(message.member, false, "no recent mentions")] })
    }

    if (!mentions.get(message.guild.id).get(message.author.id)) {
        return message.channel.send({ embeds: [new CustomEmbed(message.member, false, "no recent mentions")] })
    }

    const userMentions = mentions.get(message.guild.id).get(message.author.id)

    if (userMentions.length == 0) {
        return message.channel.send({ embeds: [new CustomEmbed(message.member, false, "no recent mentions")] })
    }

    userMentions.reverse()

    const pages = new Map()

    for (let i of userMentions) {
        if (pages.size == 0) {
            const page1 = []
            page1.push(`${timeSince(i.date)} ago|6|9|**${i.user}**: ${i.content}\n[jump](${i.link})`)
            pages.set(1, page1)
        } else {
            const lastPage = pages.size

            if (pages.get(lastPage).length >= 3) {
                const newPage = []
                newPage.push(`${timeSince(i.date)} ago|6|9|**${i.user}**: ${i.content}\n[jump](${i.link})`)
                pages.set(lastPage + 1, newPage)
            } else {
                pages.get(lastPage).push(`${timeSince(i.date)} ago|6|9|**${i.user}**: ${i.content}\n[jump](${i.link})`)
            }
        }
    }

    userMentions.reverse()

    const embed = new CustomEmbed(message.member, false).setTitle("recent mentions")

    for (let i of pages.get(1)) {
        const fieldName = i.split("|6|9|")[0]
        const fieldValue = i.split("|6|9|").splice(-1, 1).join("")
        embed.addField(fieldName, fieldValue)
    }

    if (pages.size >= 2) {
        embed.setFooter(`page 1/${pages.size}`)
    }

    let row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY"),
        new MessageButton().setCustomId("❌").setLabel("clear mentions").setStyle("DANGER")
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

    if (pages.size >= 2) {
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

            const newEmbed = new CustomEmbed(message.member, false).setTitle("recent mentions")

            if (reaction == "⬅") {
                if (currentPage <= 1) {
                    return pageManager()
                } else {
                    currentPage--

                    for (let i of pages.get(currentPage)) {
                        const fieldName = i.split("|6|9|")[0]
                        const fieldValue = i.split("|6|9|").splice(-1, 1).join("")
                        newEmbed.addField(fieldName, fieldValue)
                    }

                    newEmbed.setFooter("page " + currentPage + "/" + lastPage)
                    if (currentPage == 1) {
                        row = new MessageActionRow().addComponents(
                            new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
                            new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false),
                            new MessageButton().setCustomId("❌").setLabel("clear mentions").setStyle("DANGER")
                        )
                    } else {
                        row = new MessageActionRow().addComponents(
                            new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                            new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false),
                            new MessageButton().setCustomId("❌").setLabel("clear mentions").setStyle("DANGER")
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

                    for (let i of pages.get(currentPage)) {
                        const fieldName = i.split("|6|9|")[0]
                        const fieldValue = i.split("|6|9|").splice(-1, 1).join("")
                        newEmbed.addField(fieldName, fieldValue)
                    }
                    newEmbed.setFooter("page " + currentPage + "/" + lastPage)
                    if (currentPage == lastPage) {
                        row = new MessageActionRow().addComponents(
                            new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                            new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(true),
                            new MessageButton().setCustomId("❌").setLabel("clear mentions").setStyle("DANGER")
                        )
                    } else {
                        row = new MessageActionRow().addComponents(
                            new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                            new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false),
                            new MessageButton().setCustomId("❌").setLabel("clear mentions").setStyle("DANGER")
                        )
                    }
                    await msg.edit({ embeds: [newEmbed], components: [row] })
                    return pageManager()
                }
            } else if (reaction == "❌") {
                mentions.get(message.guild.id).set(message.author.id, [])

                newEmbed.setDescription("✅ mentions cleared")

                return msg.edit({ embeds: [newEmbed], components: [] })
            }
        }

        return pageManager()
    }
}

cmd.setRun(run)

module.exports = cmd

function timeSince(date) {
    const ms = Math.floor(new Date() - date)

    const days = Math.floor(ms / (24 * 60 * 60 * 1000))
    const daysms = ms % (24 * 60 * 60 * 1000)
    const hours = Math.floor(daysms / (60 * 60 * 1000))
    const hoursms = ms % (60 * 60 * 1000)
    const minutes = Math.floor(hoursms / (60 * 1000))
    const minutesms = ms % (60 * 1000)
    const sec = Math.floor(minutesms / 1000)

    let output = ""

    if (days > 0) {
        output = output + days + "d "
    }

    if (hours > 0) {
        output = output + hours + "h "
    }

    if (minutes > 0) {
        output = output + minutes + "m "
    }

    if (sec > 0) {
        output = output + sec + "s"
    } else if (output != "") {
        output = output.substr(0, output.length - 1)
    }

    if (output == "") {
        output = "0s"
    }

    return output
}
