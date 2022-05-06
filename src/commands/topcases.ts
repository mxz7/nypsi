import { CommandInteraction, Message, Permissions } from "discord.js"
import { profileExists, getAllCases } from "../utils/moderation/utils"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { getMember } from "../utils/functions/member"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
import { getPrefix } from "../utils/guilds/utils"

const cooldown = new Map()

const cmd = new Command("topcases", "see who has the top moderation cases", Categories.MODERATION).setPermissions([
    "MANAGE_MESSAGES",
    "MODERATE_MEMBERS",
])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) {
        if (!message.member.permissions.has(Permissions.FLAGS.MODERATE_MEMBERS)) {
            return
        }
    }

    if (!profileExists(message.guild)) return message.channel.send({ embeds: [new ErrorEmbed("no data for this server")] })

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

    const cases = getAllCases(message.guild)

    if (cases.length <= 0) return message.channel.send({ embeds: [new ErrorEmbed("no data for this server")] })

    cooldown.set(message.author.id, new Date())
    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 5000)

    const embed = new CustomEmbed(message.member, true).setHeader("top cases")

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        const topStaff = new Map()
        const topMembers = new Map()

        let deletedCaseCount = 0

        for (const case0 of cases) {
            if (case0.deleted) {
                deletedCaseCount++
                continue
            }

            if (topStaff.has(case0.moderator)) {
                topStaff.set(case0.moderator, topStaff.get(case0.moderator) + 1)
            } else {
                topStaff.set(case0.moderator, 1)
            }

            if (topMembers.has(case0.user)) {
                topMembers.set(case0.user, topMembers.get(case0.user) + 1)
            } else {
                topMembers.set(case0.user, 1)
            }
        }

        const staff = []
        const members = []

        for (const s of topStaff.keys()) {
            staff.push(s)
        }

        for (const m of topMembers.keys()) {
            members.push(m)
        }

        staff.sort(function (a, b) {
            return topStaff.get(b) - topStaff.get(a)
        })

        members.sort(function (a, b) {
            return topMembers.get(b) - topMembers.get(a)
        })

        const staffText = []
        const memberText = []

        let count = 0

        for (const s of staff) {
            if (count >= 5) break

            staffText[count] = count + 1 + " `" + s + "` **" + topStaff.get(s).toLocaleString() + "** punishments given"

            count++
        }

        count = 0

        for (const m of members) {
            if (count >= 5) break

            let username: any = message.guild.members.cache.find((mem) => mem.id == m)

            if (!username) {
                username = m
            } else {
                username = username.user.tag
            }

            memberText[count] =
                count + 1 + " `" + username + "` **" + topMembers.get(m).toLocaleString() + "** punishments taken"

            count++
        }

        embed.addField("top staff", staffText.join("\n"), true)
        embed.addField("top members", memberText.join("\n"), true)

        if (deletedCaseCount) {
            embed.setFooter(
                `${prefix}topcases <user> | ${cases.length.toLocaleString()} total cases | ${deletedCaseCount.toLocaleString()} deleted cases`
            )
        } else {
            embed.setFooter(`${prefix}topcases <user> | ${cases.length.toLocaleString()} total cases`)
        }
    } else {
        let member

        if (message.mentions.members.first()) {
            member = message.mentions.members.first()
        } else {
            const members = message.guild.members.cache

            if (args[0].length == 18) {
                member = members.find((m) => m.user.id == args[0])

                if (!member) {
                    member = args[0]
                }
            } else {
                member = await getMember(message.guild, args.join(" "))

                if (!member) {
                    return message.channel.send({
                        embeds: [new ErrorEmbed("can't find `" + args.join(" ") + "`")],
                    })
                }
            }
        }

        let deletedCasesModerator = 0
        let deletedCases = 0

        let punished = 0
        let punishments = 0

        let mutes = 0
        let bans = 0
        let kicks = 0
        let warns = 0
        let unbans = 0
        let unmutes = 0

        for (const case0 of cases) {
            if (case0.moderator == member.user.tag) {
                if (case0.deleted) {
                    deletedCasesModerator++
                } else {
                    punished++

                    switch (case0.type) {
                        case "mute":
                            mutes++
                            break
                        case "ban":
                            bans++
                            break
                        case "kick":
                            kicks++
                            break
                        case "warn":
                            warns++
                            break
                        case "unban":
                            unbans++
                            break
                        case "unmute":
                            unmutes++
                            break
                    }
                }
            } else if (case0.user == member.user.id) {
                if (case0.deleted) {
                    deletedCases++
                } else {
                    punishments++
                }
            }
        }

        embed.setDescription(member.user.toString())

        if (punished > 5) {
            embed.addField(
                "moderator stats",
                "cases `" +
                    punished.toLocaleString() +
                    "`\ndeleted cases `" +
                    deletedCasesModerator.toLocaleString() +
                    "`\nbans `" +
                    bans.toLocaleString() +
                    "`\nkicks `" +
                    kicks.toLocaleString() +
                    "`\nmutes `" +
                    mutes.toLocaleString() +
                    "`\nwarns `" +
                    warns.toLocaleString() +
                    "`\nunbans `" +
                    unbans.toLocaleString() +
                    "`\nunmutes `" +
                    unmutes.toLocaleString() +
                    "`",
                true
            )
        }
        embed.addField(
            "member stats",
            "punishments `" + punishments.toLocaleString() + "`\ndeleted `" + deletedCases.toLocaleString() + "`",
            true
        )
    }

    return await message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
