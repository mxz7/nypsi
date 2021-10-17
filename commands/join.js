const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { getMember, formatDate, daysAgo } = require("../utils/utils")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { inCooldown, addCooldown } = require("../utils/guilds/utils")
const workerSort = require("../utils/sort-worker")
const { inPlaceSort } = require("fast-sort")

const cmd = new Command("join", "information about when you joined the server", categories.INFO).setAliases(["joined"])

const sortCache = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let member

    if (args.length == 0) {
        member = message.member
    } else {
        if (!message.mentions.members.first()) {
            member = await getMember(message, args[0])
        } else {
            member = message.mentions.members.first()
        }
    }

    if (!member) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] })
    }

    const joinedServer = formatDate(member.joinedAt).toLowerCase()
    const timeAgo = daysAgo(new Date(member.joinedAt))

    let members

    if (inCooldown(message.guild) || message.guild.memberCount == message.guild.members.cache.size) {
        members = message.guild.members.cache
    } else {
        members = await message.guild.members.fetch()
        addCooldown(message.guild, 3600)
    }

    let membersSorted = []

    if (sortCache.has(message.guild.id) && sortCache.get(message.guild.id).length == message.guild.memberCount) {
        membersSorted = sortCache.get(message.guild.id)
    } else if (message.guild.memberCount < 69420) {
        const membersMap = new Map()

        members.forEach((m) => {
            if (m.joinedTimestamp) {
                membersSorted.push(m.id)
                membersMap.set(m.id, m.joinedAt)
            }
        })

        if (membersSorted.length > 1500) {
            const msg = await message.channel.send({
                embeds: [
                    new CustomEmbed(message.member, false, `sorting ${membersSorted.length.toLocaleString()} members..`),
                ],
            })
            membersSorted = await workerSort(membersSorted, membersMap)
            await msg.delete()
        } else {
            inPlaceSort(membersSorted).asc((i) => membersMap.get(i))
        }

        sortCache.set(message.guild.id, membersSorted)

        setTimeout(() => sortCache.delete(message.guild.id), 86400000)
    }

    let joinPos = membersSorted.indexOf(member.id) + 1

    if (joinPos == 0) joinPos = "invalid"

    const embed = new CustomEmbed(
        message.member,
        false,
        `joined on **${joinedServer}**\n - **${timeAgo.toLocaleString()}** days ago\njoin position is **${
            joinPos != "invalid" ? joinPos.toLocaleString() : "--"
        }**`
    )
        .setTitle(member.user.tag)
        .setThumbnail(member.user.displayAvatarURL({ format: "png", dynamic: true, size: 128 }))

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
