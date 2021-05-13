const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { getMember, formatDate, daysAgo } = require("../utils/utils")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { inCooldown, addCooldown } = require("../utils/guilds/utils")
const { inPlaceSort } = require("fast-sort")

const cmd = new Command(
    "join",
    "information about when you joined the server",
    categories.INFO
).setAliases(["joined"])

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
        return message.channel.send(new ErrorEmbed("invalid user"))
    }

    const joinedServer = formatDate(member.joinedAt).toLowerCase()
    const timeAgo = daysAgo(new Date(member.joinedAt))

    let members

    if (
        inCooldown(message.guild) ||
        message.guild.memberCount == message.guild.members.cache.size ||
        message.guild.memberCount <= 50
    ) {
        members = message.guild.members.cache
    } else {
        members = await message.guild.members.fetch()
        addCooldown(message.guild, 3600)
    }

    let membersSorted = []

    if (
        sortCache.has(message.guild.id) &&
        sortCache.get(message.guild.id).length == message.guild.memberCount
    ) {
        membersSorted = sortCache.get(message.guild.id)
    } else {
        members.forEach((m) => {
            if (m.joinedTimestamp) {
                membersSorted.push(m.id)
            }
        })

        inPlaceSort(membersSorted).asc((i) => members.find((m) => m.id == i).joinedAt)

        sortCache.set(message.guild.id, membersSorted)

        setTimeout(() => sortCache.delete(message.guild.id), 60000)
    }

    let joinPos = membersSorted.indexOf(member.id) + 1

    if (joinPos == 0) joinPos = "invalid"

    const embed = new CustomEmbed(
        message.member,
        false,
        "joined on **" +
            joinedServer +
            "**\n" +
            " - **" +
            timeAgo.toLocaleString() +
            "** days ago\n" +
            "join position is **" +
            joinPos +
            "**"
    )
        .setTitle(member.user.tag)
        .setThumbnail(member.user.displayAvatarURL({ format: "png", dynamic: true, size: 128 }))

    return message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd
