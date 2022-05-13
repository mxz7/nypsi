import { CommandInteraction, GuildMember, Message, MessageActionRow, MessageButton } from "discord.js"
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler"
import { formatDate } from "../utils/functions/date"
import { getMember } from "../utils/functions/member"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders"
import {
    usernameProfileExists,
    createUsernameProfile,
    fetchUsernameHistory,
    clearUsernameHistory,
    isTracking,
} from "../utils/users/utils"

const cmd = new Command("usernamehistory", "view a user's username history", Categories.INFO).setAliases(["un", "usernames"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member)

        return message.channel.send({ embeds: [embed] })
    }

    let member: GuildMember

    if (args.length == 0) {
        member = message.member
    } else {
        if (args[0].toLowerCase() == "-clear") {
            clearUsernameHistory(message.member)
            return message.channel.send({
                embeds: [new CustomEmbed(message.member, false, "✅ your username history has been cleared")],
            })
        }

        if (!message.mentions.members.first()) {
            member = await getMember(message.guild, args.join(" "))
        } else {
            member = message.mentions.members.first()
        }
    }

    if (!member) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] })
    }

    await addCooldown(cmd.name, message.member, 5)

    if (!usernameProfileExists(member)) createUsernameProfile(member, member.user.tag)

    const isUserTracking = isTracking(member)

    const history = fetchUsernameHistory(member)

    if (history.length == 0) {
        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, "this user has no username history")],
        })
    }

    /**
     * @type {Map<Number, Array<{ value: String, date: Number }>}
     */
    const pages = new Map()

    for (const item of history) {
        if (pages.size == 0) {
            if (!isUserTracking) {
                pages.set(1, [{ value: "[tracking disabled]", date: Date.now() }, item])
            } else {
                pages.set(1, [item])
            }
        } else {
            if (pages.get(pages.size).length >= 7) {
                pages.set(pages.size + 1, [item])
            } else {
                const current = pages.get(pages.size)
                current.push(item)
                pages.set(pages.size, current)
            }
        }
    }

    const embed = new CustomEmbed(message.member, true)
        .setTitle(member.user.tag)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))

    let description = ""

    for (const item of pages.get(1)) {
        description += `\`${item.value}\` | \`${formatDate(item.date)}\`\n`
    }

    embed.setDescription(description)

    if (pages.size > 1) {
        embed.setFooter(`page 1/${pages.size}`)
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

    if (pages.size == 1) return

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

        const newEmbed = new CustomEmbed(message.member, false)
            .setTitle(member.user.tag)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))

        if (reaction == "⬅") {
            if (currentPage <= 1) {
                return pageManager()
            } else {
                currentPage--

                let description = ""

                for (const item of pages.get(currentPage)) {
                    description += `\`${item.value}\` | \`${formatDate(item.date)}\`\n`
                }

                newEmbed.setDescription(description)

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

                let description = ""

                for (const item of pages.get(currentPage)) {
                    description += `\`${item.value}\` | \`${formatDate(item.date)}\`\n`
                }

                newEmbed.setDescription(description)

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

cmd.setRun(run)

module.exports = cmd
