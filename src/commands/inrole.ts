import { Collection, CommandInteraction, GuildMember, Message, MessageActionRow, MessageButton, Role } from "discord.js"
import { inCooldown, addCooldown, getPrefix } from "../utils/guilds/utils"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"

const cooldown = new Map()

const cmd = new Command("inrole", "get the members in a role", Categories.UTILITY)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr.getTime() - init) / 1000)
        const time = 5 - diff

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

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}inrole <role>`)] })
    }

    const roles = message.guild.roles.cache

    let role: Role

    if (message.mentions.roles.first()) {
        role = message.mentions.roles.first()
    } else if (args[0].length == 18 && parseInt(args[0])) {
        role = roles.find((r) => r.id == args[0])
    } else {
        role = roles.find((r) => r.name.toLowerCase().includes(args.join(" ").toLowerCase()))
    }

    if (!role) {
        return message.channel.send({ embeds: [new ErrorEmbed(`couldn't find the role \`${args.join(" ")}\``)] })
    }

    let members: Collection<string, GuildMember>

    if (
        inCooldown(message.guild) ||
        message.guild.memberCount == message.guild.members.cache.size ||
        message.guild.memberCount <= 250
    ) {
        members = message.guild.members.cache
    } else {
        members = await message.guild.members.fetch()

        addCooldown(message.guild, 3600)
    }

    const memberList = new Map()
    let count = 0

    members.forEach((m) => {
        if (m.roles.cache.has(role.id)) {
            count++
            if (memberList.size >= 1) {
                const currentPage = memberList.get(memberList.size)

                if (currentPage.length >= 10) {
                    const newPage = ["`" + m.user.tag + "`"]

                    memberList.set(memberList.size + 1, newPage)
                } else {
                    currentPage.push("`" + m.user.tag + "`")

                    memberList.set(memberList.size, currentPage)
                }
            } else {
                const newPage = ["`" + m.user.tag + "`"]

                memberList.set(1, newPage)
            }
        }
    })

    if (!memberList.get(1)) {
        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, "that role has no members")],
        })
    }

    const embed = new CustomEmbed(message.member, false, memberList.get(1).join("\n"))
        .setHeader(role.name + " [" + count.toLocaleString() + "]")
        .setFooter(`page 1/${memberList.size}`)

    /**
     * @type {Message}
     */
    let msg

    let row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY")
    )

    if (memberList.size >= 2) {
        msg = await message.channel.send({ embeds: [embed], components: [row] })
    } else {
        return await message.channel.send({ embeds: [embed] })
    }

    if (memberList.size <= 1) return

    let currentPage = 1
    const lastPage = memberList.size

    const filter = (i) => i.user.id == message.author.id

    async function pageManager() {
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

        if (reaction == "⬅") {
            if (currentPage <= 1) {
                return pageManager()
            } else {
                currentPage--
                embed.setDescription(memberList.get(currentPage).join("\n"))
                embed.setFooter(`page ${currentPage}/${lastPage}`)
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
                await msg.edit({ embeds: [embed], components: [row] })
                return pageManager()
            }
        } else if (reaction == "➡") {
            if (currentPage == lastPage) {
                return pageManager()
            } else {
                currentPage++
                embed.setDescription(memberList.get(currentPage).join("\n"))
                embed.setFooter(`page ${currentPage}/${lastPage}`)
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
                await msg.edit({ embeds: [embed], components: [row] })
                return pageManager()
            }
        }
    }
    return pageManager()
}

cmd.setRun(run)

module.exports = cmd
