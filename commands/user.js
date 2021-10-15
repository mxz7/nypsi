const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { getMember, formatDate } = require("../utils/utils")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const workerSort = require("../utils/sort-worker")
const { inCooldown, addCooldown } = require("../utils/guilds/utils")

const cmd = new Command("user", "view info about a user in the server", categories.INFO).setAliases(
    ["whois", "who"]
)

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
            let username = args.join(" ")

            if (username.includes(" -id")) {
                username = username.split(" -id").join("")
            } else if (username.includes("-id ")) {
                username = username.split("-id ").join("")
            }

            member = await getMember(message, username)
        } else {
            member = message.mentions.members.first()
        }
        if (args[0] == "-id" && args.length == 1) {
            member = message.member
        }
    }

    if (!member) {
        return message.channel.send(new ErrorEmbed("invalid user"))
    }

    if (args.join(" ").includes("-id")) {
        const embed = new CustomEmbed(message.member, false, "`" + member.user.id + "`").setTitle(
            member.user.tag
        )
        return message.channel.send(embed)
    }

    let members

    if (
        inCooldown(message.guild) ||
        message.guild.memberCount == message.guild.members.cache.size
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
    } else if (message.guild.memberCount < 69420) {
        const membersMap = new Map()

        members.forEach((m) => {
            if (m.joinedTimestamp) {
                membersSorted.push(m.id)
                membersMap.set(m.id, m.joinedAt)
            }
        })

        membersSorted = await workerSort(membersSorted, membersMap)

        sortCache.set(message.guild.id, membersSorted)

        setTimeout(() => sortCache.delete(message.guild.id), 86400000)
    }

    let joinPos = membersSorted.indexOf(member.id) + 1

    if (joinPos == 0) joinPos = "invalid"

    const joined = formatDate(member.joinedAt)
    const daysAgo = timeSince(new Date(member.joinedAt))
    const created = formatDate(member.user.createdAt)
    const roles = member.roles._roles

    let rolesText = ""

    roles.forEach((role) => {
        rolesText = rolesText + role.toString() + " "
    })

    rolesText = rolesText.split("@everyone").join("")

    const embed = new CustomEmbed(message.member, false, member.user.toString())
        .setThumbnail(member.user.displayAvatarURL({ format: "png", dynamic: true, size: 128 }))
        .setTitle(member.user.tag)

        .addField(
            "account",
            `**id** ${member.user.id}\n**created** ${created.toString().toLowerCase()}`,
            true
        )

        .addField(
            "server",
            `**joined** ${joined.toString().toLowerCase()}\n**join pos** ${
                joinPos != "invalid" ? joinPos.toLocaleString() : "--"
            }`,
            true
        )

    if (rolesText != " ") {
        embed.addField("roles [" + member._roles.length + "]", rolesText)
    }

    message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd

function timeSince(date) {
    const ms = Math.floor(new Date() - date)

    const days = Math.floor(ms / (24 * 60 * 60 * 1000))

    return days
}
