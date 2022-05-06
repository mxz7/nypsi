import { CommandInteraction, GuildMember, Message, MessageActionRow, MessageButton, Permissions } from "discord.js"
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command"
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders"
import { createProfile, getMutedUsers, profileExists } from "../utils/moderation/utils"

const cmd = new Command("muted", "view the currently muted members in the server", Categories.MODERATION).setPermissions([
    "MANAGE_MESSAGES",
])

const cooldown = new Map()

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) return

    if (!profileExists(message.guild)) createProfile(message.guild)

    const muted = getMutedUsers(message.guild)

    if (!muted || muted.length == 0) {
        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, "there is noone currently muted with nypsi")],
        })
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
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 15000)

    const pages: Map<number, string[]> = new Map()

    for (const m of muted) {
        const user: GuildMember = await message.guild.members.fetch(m.user)

        const msg = `\`${user ? user.user.tag : m.user}\` ${
            m.unmute_time >= 9999999999999
                ? "is permanently muted"
                : `will be unmuted <t:${Math.floor(m.unmute_time / 1000)}:R>`
        }`

        if (pages.size == 0) {
            const page1 = []
            page1.push(msg)
            pages.set(1, page1)
        } else {
            const lastPage = pages.size

            if (pages.get(lastPage).length > 10) {
                const newPage = []
                newPage.push(msg)
                pages.set(pages.size + 1, newPage)
            } else {
                pages.get(lastPage).push(msg)
            }
        }
    }

    const embed = new CustomEmbed(message.member, false).setHeader("muted users")

    embed.setDescription(pages.get(1).join("\n"))
    embed.setFooter(`1/${pages.size}`)

    let row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY")
    )

    let msg: Message

    if (pages.size == 1) {
        return await message.channel.send({ embeds: [embed] })
    } else {
        msg = await message.channel.send({ embeds: [embed], components: [row] })
    }

    let currentPage = 1
    const lastPage = pages.size

    const filter = (i) => i.user.id == message.author.id

    const pageManager = async () => {
        const reaction = await msg
            .awaitMessageComponent({ filter, time: 30000 })
            .then(async (collected) => {
                await collected.deferUpdate()
                return collected.customId
            })
            .catch(async () => {
                await msg.edit({ components: [] }).catch(() => {})
            })

        if (!reaction) return

        if (reaction == "⬅") {
            if (currentPage <= 1) {
                return pageManager()
            } else {
                currentPage--

                embed.setDescription(pages.get(currentPage).join("\n"))
                embed.setFooter(`${currentPage}/${lastPage}`)

                if (currentPage == 1) {
                    row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY")
                    )
                } else {
                    row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY")
                    )
                }
                await msg.edit({ embeds: [embed], components: [row] })
                return pageManager()
            }
        } else {
            if (currentPage >= lastPage) {
                return pageManager()
            } else {
                currentPage++

                embed.setDescription(pages.get(currentPage).join("\n"))
                embed.setFooter(`${currentPage}/${lastPage}`)

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
            }
        }
    }
    return pageManager()
}

cmd.setRun(run)

module.exports = cmd
