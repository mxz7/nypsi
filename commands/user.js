const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { getMember, formatDate } = require("../utils/utils")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { sort } = require("timsort")

const cmd = new Command(
    "user",
    "view info about a user in the server",
    categories.INFO
).setAliases(["whois", "who"])

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

    const members = message.guild.members.cache
    let membersSorted = []

    members.forEach((m) => {
        if (m.joinedTimestamp) {
            membersSorted.push(m.id)
        }
    })

    // membersSorted.sort(function (a, b) {
    //     return members.find((m) => m.id == a).joinedAt - members.find((m) => m.id == b).joinedAt
    // })

    sort(membersSorted, (a, b) => {
        return members.find((m) => m.id == a).joinedAt - members.find((m) => m.id == b).joinedAt
    })

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
            "**joined** " + joined.toString().toLowerCase() + "\n" + "**join pos** " + joinPos,
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
