const { getMember, formatDate } = require("../utils/utils")
const { Message } = require("discord.js")
const { getCases, profileExists, createProfile } = require("../utils/moderation/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getPrefix } = require("../utils/guilds/utils")

const cooldown = new Map()

const cmd = new Command(
    "history",
    "view punishment history for a given user",
    categories.MODERATION
)
    .setAliases(["modlogs", "hist"])
    .setPermissions(["MANAGE_MESSAGES"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!message.member.hasPermission("MANAGE_MESSAGES")) return

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

        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``))
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
                return message.channel.send(
                    new ErrorEmbed(
                        `can't find \`${args[0]}\` - please use a user ID if they are no longer in the server`
                    )
                )
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
        return message.channel.send(new ErrorEmbed("no history to display"))
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

    const embed = new CustomEmbed(message.member).setFooter(
        "page 1/" + pages.length + " | total: " + cases.length
    )

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
            embed.addField(
                "case " + case0.case_id,
                "`" + case0.type + "` - " + case0.command + "\non " + date
            )
        }
    }

    const msg = await message.channel.send({ embeds: [embed] })

    if (pages.length > 1) {
        await msg.react("⬅")
        await msg.react("➡")

        let currentPage = 0

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
                    newEmbed.setFooter(
                        "page " +
                            (currentPage + 1) +
                            "/" +
                            pages.length +
                            " | total: " +
                            cases.length
                    )
                    await msg.edit(newEmbed)
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
                    newEmbed.setFooter(
                        "page " +
                            (currentPage + 1) +
                            "/" +
                            pages.length +
                            " | total: " +
                            cases.length
                    )
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
