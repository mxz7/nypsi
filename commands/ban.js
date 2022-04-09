const { Message, Permissions } = require("discord.js")
const { newCase, profileExists, createProfile, newBan } = require("../utils/moderation/utils")
const { inCooldown, addCooldown, getPrefix } = require("../utils/guilds/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("ban", "ban one or more users from the server", categories.MODERATION).setPermissions([
    "BAN_MEMBERS",
])

cmd.slashEnabled = true
cmd.slashData.addUserOption(option => 
    option.setName("user")
        .setDescription("member to ban from the server")
        .setRequired(true))
    .addStringOption(option =>
        option.setName("reason")
            .setDescription("reason for the ban")
            .setRequired(true)
    )

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    const send = async (data) => {
        if (message.interaction) {
            return await message.reply(data)
        } else {
            return await message.channel.send(data)
        }
    }

    if (!message.member.permissions.has(Permissions.FLAGS.BAN_MEMBERS)) {
        if (message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) {
            return send({ embeds: [new ErrorEmbed("you need the `ban members` permission")] })
        }
        return
    }

    if (!message.guild.me.permissions.has(Permissions.FLAGS.BAN_MEMBERS)) {
        return send({
            embeds: [new ErrorEmbed("i need the `ban members` permission for this command to work")],
        })
    }

    if (!profileExists(message.guild)) createProfile(message.guild)

    let idOnly = false

    const prefix = getPrefix(message.guild)

    if (args.length == 0 || !args[0]) {
        const embed = new CustomEmbed(message.member, false)
            .setTitle("ban help")
            .addField("usage", `${prefix}ban <@user(s)> (reason) [-s] [-k]`)
            .addField(
                "help",
                "**<>** required | **()** optional | **[]** parameter\n" +
                    "**<@users>** you can ban one or more members in one command (must tag them)\n" +
                    "**(reason)** reason for the ban, will be given to all banned members\n" +
                    "**[-s]** if used, command message will be deleted and the output will be sent to moderator as a DM if possible\n" +
                    "**[-k]** if used, messages from banned members wont be deleted"
            )
            .addField(
                "examples",
                `${prefix}ban @member hacking\n${prefix}ban @member @member2 @member3 hacking\n${prefix}ban @member hacking -s\n${prefix}ban @member 1d annoying`
            )

        return send({ embeds: [embed] })
    }

    if (args[0].length == 18 && message.mentions.members.first() == null) {
        let members

        if (inCooldown(message.guild)) {
            members = message.guild.members.cache
        } else {
            members = await message.guild.members.fetch()
            addCooldown(message.guild, 3600)
        }

        const member = members.find((m) => m.id == args[0])

        if (!member) {
            idOnly = true

            message.mentions.members.set(args[0], args[0])
        } else {
            message.mentions.members.set(member.user.id, member)
        }
    } else if (message.mentions.members.first() == null) {
        return send({
            embeds: [new ErrorEmbed("unable to find member with ID `" + args[0] + "`")],
        })
    }

    const members = message.mentions.members
    let reason = message.member.user.tag + ": "
    let days = 1
    let unbanDate
    let temporary = false
    let duration

    if (args.length != members.size) {
        for (let i = 0; i < members.size; i++) {
            args.shift()
        }

        duration = getDuration(args[0].toLowerCase())

        unbanDate = new Date().getTime() + duration * 1000

        if (duration) {
            temporary = true
            args.shift()
        }

        reason = reason + args.join(" ")
    } else {
        reason = reason + "no reason given"
    }

    if (reason.includes("-k")) {
        days = 0
    }

    let count = 0
    let failed = []
    let fail = false

    for (let member of members.keys()) {
        if (!idOnly) {
            const targetHighestRole = members.get(member).roles.highest
            const memberHighestRole = message.member.roles.highest

            if (
                targetHighestRole.position >= memberHighestRole.position &&
                message.guild.ownerId != message.member.user.id
            ) {
                failed.push(members.get(member).user)
                continue
            }

            if (members.get(member).user.id == message.client.user.id) {
                await send({ content: "well... i guess this is goodbye ):" })
                await message.guild.leave()
                return
            }
        }

        await message.guild.members
            .ban(member, {
                days: days,
                reason: reason,
            })
            .then(() => {
                count++
            })
            .catch(() => {
                if (idOnly) {
                    fail = true
                    return send({
                        embeds: [new ErrorEmbed(`unable to ban the id: \`${member}\``)],
                    })
                }
                failed.push(members.get(member).user)
            })
    }

    if (fail) return

    if (count == 0) {
        return send({ embeds: [new ErrorEmbed("i was unable to ban any users")] })
    }

    let banLength = ""

    const embed = new CustomEmbed(message.member)
        .setTitle("ban | " + message.member.user.username)
        .setDescription("✅ **" + count + "** members banned for: " + reason.split(": ")[1])

    if (temporary) {
        banLength = getTime(duration * 1000)
        embed.setDescription(`✅ **${count}** members banned for: **${banLength}**`)
    } else if (reason.split(": ")[1] == "no reason given") {
        embed.setDescription(`✅ **${count}** members banned`)
    } else {
        embed.setDescription(`✅ **${count}** members banned for: ${reason.split(": ")[1]}`)
    }

    if (count == 1 && failed.length == 0) {
        if (idOnly) {
            if (temporary) {
                embed.setDescription(`✅ \`${members.first()}\` has been banned for: **${banLength}**`)
            } else if (reason.split(": ")[1] == "no reason given") {
                embed.setDescription(`✅ \`${members.first()}\` has been banned`)
            } else {
                embed.setDescription(`✅ \`${members.first()}\` has been banned for: ${reason.split(": ")[1]}`)
            }
        } else {
            if (temporary) {
                embed.setDescription(`✅ \`${members.first().user.tag}\` has been banned for: **${banLength}**`)
            } else if (reason.split(": ")[1] == "no reason given") {
                embed.setDescription("✅ `" + members.first().user.tag + "` has been banned")
            } else {
                embed.setDescription("✅ `" + members.first().user.tag + "` has been banned for: " + reason.split(": ")[1])
            }
        }
    }

    if (failed.length != 0) {
        const failedTags = []
        for (let fail1 of failed) {
            failedTags.push(fail1.tag)
        }

        embed.addField("error", "unable to ban: " + failedTags.join(", "))
    }

    if (args.join(" ").includes("-s")) {
        await message.delete()
        await message.member.send({ embeds: [embed] }).catch()
    } else {
        await send({ embeds: [embed] })
    }

    if (idOnly) {
        newCase(message.guild, "ban", members.first(), message.member.user.tag, reason.split(": ")[1])
        if (temporary) {
            newBan(message.guild, members.first(), unbanDate)
        }
    } else {
        const members1 = Array.from(members.keys())

        if (failed.length != 0) {
            for (fail of failed) {
                if (members1.includes(fail.id)) {
                    members1.splice(members1.indexOf(fail.id), 1)
                }
            }
        }

        newCase(message.guild, "ban", members1, message.author.tag, reason.split(": ")[1])

        if (temporary) {
            newBan(message.guild, members1, unbanDate)
        }

        if (args.join(" ").includes("-s")) return
        for (let member of members1) {
            const m = members.get(member)

            if (reason.split(": ")[1] == "no reason given") {
                await m
                    .send({
                        content: `you have been banned from ${message.guild.name}${
                            temporary ? `\n\nexpires in **${banLength}**}` : ""
                        }`,
                    })
                    .catch(() => {})
            } else {
                const embed = new CustomEmbed(m)
                    .setTitle(`banned from ${message.guild.name}`)
                    .addField("reason", `\`${reason.split(": ")[1]}\``, true)

                if (temporary) {
                    embed.addField("length", `\`${banLength}\``, true)
                    embed.setFooter("unbanned at:")
                    embed.setTimestamp(unbanDate)
                }

                await m.send({ content: `you have been banned from ${message.guild.name}`, embeds: [embed] }).catch(() => {})
            }
        }
    }
}

cmd.setRun(run)

module.exports = cmd

function getDuration(duration) {
    duration.toLowerCase()

    if (duration.includes("d")) {
        if (!parseInt(duration.split("d")[0])) return undefined

        const num = duration.split("d")[0]

        return num * 86400
    } else if (duration.includes("h")) {
        if (!parseInt(duration.split("h")[0])) return undefined

        const num = duration.split("h")[0]

        return num * 3600
    } else if (duration.includes("m")) {
        if (!parseInt(duration.split("m")[0])) return undefined

        const num = duration.split("m")[0]

        return num * 60
    } else if (duration.includes("s")) {
        if (!parseInt(duration.split("s")[0])) return undefined

        const num = duration.split("s")[0]

        return num
    }
}

function getTime(ms) {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000))
    const daysms = ms % (24 * 60 * 60 * 1000)
    const hours = Math.floor(daysms / (60 * 60 * 1000))
    const hoursms = ms % (60 * 60 * 1000)
    const minutes = Math.floor(hoursms / (60 * 1000))
    const minutesms = ms % (60 * 1000)
    const sec = Math.floor(minutesms / 1000)

    let output = ""

    if (days > 0) {
        let a = " days"

        if (days == 1) {
            a = " day"
        }

        output = days + a
    }

    if (hours > 0) {
        let a = " hours"

        if (hours == 1) {
            a = " hour"
        }

        if (output == "") {
            output = hours + a
        } else {
            output = `${output} ${hours}${a}`
        }
    }

    if (minutes > 0) {
        let a = " mins"

        if (minutes == 1) {
            a = " min"
        }

        if (output == "") {
            output = minutes + a
        } else {
            output = `${output} ${minutes}${a}`
        }
    }

    if (sec > 0) {
        output = output + sec + "s"
    }

    return output
}
