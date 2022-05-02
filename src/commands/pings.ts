const { Message, MessageActionRow, MessageButton } = require("discord.js")
import { getPrefix } from "../utils/guilds/utils"
import { isPremium } from "../utils/premium/utils"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders")
const { fetchUserMentions } = require("../utils/users/utils")
const { getDatabase } = require("../utils/database/database")
const { userExists } = require("../utils/economy/utils")

const cooldown = new Map()

const cmd = new Command("pings", "view who mentioned you recently", Categories.UTILITY).setAliases([
    "mentions",
    "whothefuckpingedme",
])

cmd.slashEnabled = true

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message) {
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
        const time = 15 - diff

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

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 15000)

    if (!(message.guild.memberCount < 150000 && (userExists(message.guild.ownerId) || isPremium(message.guild.ownerId)))) {
        const embed = new ErrorEmbed(
            `this server does not qualify to track mentions (${getPrefix(
                message.guild
            )}pings)\n\njoin the support server for help (${getPrefix(message.guild)}support)`
        )

        return send({ embeds: [embed] })
    }

    const mentions = fetchUserMentions(message.guild, message.member)

    if (!mentions || mentions.length == 0) {
        return send({ embeds: [new CustomEmbed(message.member, false, "no recent mentions")] })
    }

    const pages = new Map()

    for (let i of mentions) {
        if (pages.size == 0) {
            const page1 = []
            page1.push(`<t:${i.date}:R>|6|9|**${i.user_tag}**: ${i.content}\n[jump](${i.url})`)
            pages.set(1, page1)
        } else {
            const lastPage = pages.size

            if (pages.get(lastPage).length >= 3) {
                const newPage = []
                newPage.push(`<t:${i.date}:R>|6|9|**${i.user_tag}**: ${i.content}\n[jump](${i.url})`)
                pages.set(lastPage + 1, newPage)
            } else {
                pages.get(lastPage).push(`<t:${i.date}:R>|6|9|**${i.user_tag}**: ${i.content}\n[jump](${i.url})`)
            }
        }
    }

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
        return await send({ embeds: [embed] })
    } else {
        msg = await send({ embeds: [embed], components: [row] })
    }

    if (pages.size >= 2) {
        let currentPage = 1
        const lastPage = pages.size

        const edit = async (data, msg) => {
            if (message.interaction) {
                await message.editReply(data)
                return await message.fetchReply()
            } else {
                return await msg.edit(data)
            }
        }

        const filter = (i) => i.user.id == message.author.id

        const pageManager = async () => {
            const reaction = await msg
                .awaitMessageComponent({ filter, time: 30000, errors: ["time"] })
                .then(async (collected) => {
                    await collected.deferUpdate()
                    return collected.customId
                })
                .catch(async () => {
                    await edit({ components: [] }).catch(() => {}, msg)
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
                getDatabase()
                    .prepare("DELETE FROM mentions WHERE guild_id = ? AND target_id = ?")
                    .run(message.guild.id, message.author.id)

                newEmbed.setDescription("✅ mentions cleared")

                return msg.edit({ embeds: [newEmbed], components: [] })
            }
        }

        return pageManager()
    }
}

cmd.setRun(run)

module.exports = cmd
