const { getMember, formatDate } = require("../utils/utils")
const { Message, Permissions, MessageActionRow, MessageButton } = require("discord.js")
const { getCases, profileExists, createProfile } = require("../utils/moderation/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getPrefix } = require("../utils/guilds/utils")

const cooldown = new Map()

const cmd = new Command("history", "view punishment history for a given user", categories.MODERATION)
    .setAliases(["modlogs", "hist"])
    .setPermissions(["MANAGE_MESSAGES"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) return

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 5 - diff

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

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member)
            .setTitle("history help")
            .addField("usage", `${prefix}history @user\n${prefix}history <user ID or tag>`)

        return message.channel.send({ embeds: [embed] })
    }

    if (!profileExists(message.guild)) createProfile(message.guild)

    let member
    let unknownMember = false

    if (message.mentions.members.first()) {
        member = message.mentions.members.first()
    } else {
        const members = message.guild.members.cache

        if (args[0].length == 18) {
            member = members.find((m) => m.user.id == args[0])

            if (!member) {
                unknownMember = true
                member = args[0]
            }
        } else {
            member = await getMember(message, args.join(" "))

            if (!member) {
                return message.channel.send({
                    embeds: [
                        new ErrorEmbed(
                            `can't find \`${args[0]}\` - please use a user ID if they are no longer in the server`
                        ),
                    ],
                })
            }
        }
    }

    let cases
    let pages = []

    if (!unknownMember) {
        cases = getCases(message.guild, member.user.id)
    } else {
        cases = getCases(message.guild, member)
    }

    if (cases.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("no history to display")] })
    }

    cooldown.set(message.author.id, new Date())
    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 5000)

    let count = 0
    let page = []
    for (let case0 of cases) {
        if (count == 5) {
            pages.push(page)
            page = []
            page.push(case0)
            count = 1
        } else {
            page.push(case0)
            count++
        }
    }

    if (count != 0) {
        pages.push(page)
    }

    const embed = new CustomEmbed(message.member).setFooter("page 1/" + pages.length + " | total: " + cases.length)

    if (unknownMember) {
        embed.setHeader("history for " + member)
    } else {
        embed.setHeader("history for " + member.user.tag)
    }

    for (let case0 of pages[0]) {
        const date = formatDate(new Date(case0.time))
        if (case0.deleted) {
            embed.addField("case " + case0.case_id, "`[deleted]`")
        } else {
            embed.addField("case " + case0.case_id, "`" + case0.type + "` - " + case0.command + "\non " + date)
        }
    }

    /**
     * @type {Message}
     */
    let msg

    let row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY")
    )

    if (pages.length >= 2) {
        msg = await message.channel.send({ embeds: [embed], components: [row] })
    } else {
        return await message.channel.send({ embeds: [embed] })
    }

    if (pages.length > 1) {
        let currentPage = 0

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

            const newEmbed = new CustomEmbed(message.member)

            if (unknownMember) {
                newEmbed.setHeader("history for " + member)
            } else {
                newEmbed.setHeader("history for " + member.user.tag)
            }

            if (!reaction) return

            if (reaction == "⬅") {
                if (currentPage <= 0) {
                    return pageManager()
                } else {
                    currentPage--
                    for (let case0 of pages[currentPage]) {
                        const date = formatDate(new Date(case0.time))
                        if (case0.deleted) {
                            newEmbed.addField("case " + case0.case_id, "`[deleted]`")
                        } else {
                            newEmbed.addField(
                                "case " + case0.case_id,
                                "`" + case0.type + "` - " + case0.command + "\non " + date
                            )
                        }
                    }
                    newEmbed.setFooter("page " + (currentPage + 1) + "/" + pages.length + " | total: " + cases.length)
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
                    for (let case0 of pages[currentPage]) {
                        const date = formatDate(new Date(case0.time))
                        if (case0.deleted) {
                            newEmbed.addField("case " + case0.case_id, "`[deleted]`")
                        } else {
                            newEmbed.addField(
                                "case " + case0.case_id,
                                "`" + case0.type + "` - " + case0.command + "\nat " + date
                            )
                        }
                    }
                    newEmbed.setFooter("page " + (currentPage + 1) + "/" + pages.length + " | total: " + cases.length)
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
}

cmd.setRun(run)

module.exports = cmd
