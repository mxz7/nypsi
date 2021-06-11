const { Message } = require("discord.js")
const { profileExists, createProfile, newCase } = require("../utils/moderation/utils")
const { inCooldown, addCooldown, getPrefix } = require("../utils/guilds/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command(
    "kicksince",
    "kick members that joined after a certain time",
    categories.MODERATION
)
    .setPermissions(["ADMINISTRATOR"])
    .setAliases(["fuckoffsince"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!message.member.hasPermission("ADMINISTRATOR")) {
        if (message.member.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send(new ErrorEmbed("you need the `administrator` permission"))
        }
        return
    }

    if (!message.guild.me.hasPermission("KICK_MEMBERS")) {
        return message.channel.send(
            new ErrorEmbed("i need the `kick members` permission for this command to work")
        )
    }

    if (!profileExists(message.guild)) createProfile(message.guild)

    const prefix = getPrefix(message.guild)

    if (args.length == 0 && message.mentions.members.first() == null) {
        const embed = new CustomEmbed(message.member)
            .setTitle("kicksince help")
            .addField("usage", `${prefix}kicksince <length> (reason)`)
            .addField(
                "help",
                "**<>** required | **()** optional | **[]** parameter\n" +
                    "**<length>** the amount of time to traceback to before kicking\n" +
                    "**(reason)** reason for the kick, will be given to all kicked members\n"
            )
            .addField("examples", `${prefix}kicksince 1h bots`)
            .addField(
                "time format examples",
                "**1d** *1 day*\n**10h** *10 hours*\n**15m** *15 minutes*\n**30s** *30 seconds*"
            )

        return message.channel.send(embed)
    }

    const time = new Date().getTime() - getDuration(args[0].toLowerCase()) * 1000

    if (!time) {
        return message.channel.send(new ErrorEmbed("invalid time length"))
    } else if (time < Date.now() - 604800000) {
        return message.channel.send(new ErrorEmbed("lol dont even try"))
    }

    await message.guild.members.fetch()

    const members = await message.guild.members.cache.filter((m) => m.user.createdTimestamp >= time)

    let status
    let statusDesc = `\`0/${members.length}\` members kicked..`
    let reason = message.member.user.tag + ": "

    if (members.length >= 15) {
        status = new CustomEmbed(message.member, false, statusDesc + "\n\n - if you'd like to cancel this operation, delete this message").setTitle(`kick | ${message.author.username}`)
    }

    /**
     * @type {Message}
     */
    let msg

    if (status) {
        await message.channel.send(status)
    }

    if (args.length > 1) {
        args.shift()

        reason += args.join(" ")
    } else {
        reason += "no reason given"
    }

    let count = 0
    let failed = []
    let interval = 0

    for (let member of members.keyArray()) {
        interval++

        if (status) {
            if (msg.deleted) {
                return message.channel.send(
                    new CustomEmbed(message.member, false, "✅ operation cancelled")
                )
            }
        }

        const targetHighestRole = members.get(member).roles.highest
        const memberHighestRole = message.member.roles.highest

        if (
            targetHighestRole.position >= memberHighestRole.position &&
            message.guild.owner.user.id != message.member.user.id
        ) {
            failed.push(members.get(member).user)
        } else {
            if (members.get(member).user.id == message.client.user.id) {
                continue
            }

            await members
                .get(member)
                .kick(reason)
                .then(() => {
                    count++
                })
                .catch(() => {
                    failed.push(members.get(member).user)
                })
            
            if (interval >= 5 && status) {
                statusDesc = `\`${count}/${members.length}\` members kicked..${failed.length != 0 ? `\n - **${failed.length}** failed` : ""}`
                status.setDescription(statusDesc + "\n\n - if you'd like to cancel this operation, delete this message")
                await msg.edit(status)
                interval = 0
            }
        }
    }

    if (count == 0) {
        return message.channel.send(new ErrorEmbed("i was unable to kick any users"))
    }

    const embed = new CustomEmbed(message.member).setTitle("kick | " + message.member.user.username)

    if (reason.split(": ")[1] == "no reason given") {
        embed.setDescription(`✅ **${count}** members kicked`)
    } else {
        embed.setDescription(`✅ **${count}** members kicked for: ${reason.split(": ")[1]}`)
    }

    if (failed.length != 0) {
        const failedTags = []
        for (let fail1 of failed) {
            failedTags.push(fail1.tag)
        }

        embed.addField("error", "unable to kick: " + failedTags.join(", "))
    }

    if (count == 1) {
        if (reason.split(": ")[1] == "no reason given") {
            embed.setDescription("✅ `" + members.first().user.tag + "` has been kicked")
        } else {
            embed.setDescription(
                "✅ `" +
                    members.first().user.tag +
                    "` has been kicked for: " +
                    reason.split(": ")[1]
            )
        }
    }

    if (status) {
        msg.delete()
    }

    await message.channel.send(embed)

    const members1 = members.keyArray()

    if (failed.length != 0) {
        for (let fail of failed) {
            if (members1.includes(fail.id)) {
                members1.splice(members1.indexOf(fail.id), 1)
            }
        }
    }

    newCase(message.guild, "kick", members1, message.author.tag, reason.split(": ")[1])

    if (args.join(" ").includes("-s")) return
    for (let member of members1) {
        const m = members.get(member)

        if (reason.split(": ")[1] == "no reason given") {
            await m.send(`you have been kicked from ${message.guild.name}`).catch(() => {})
        } else {
            const embed = new CustomEmbed(m)
                .setTitle(`kicked from ${message.guild.name}`)
                .addField("reason", `\`${reason.split(": ")[1]}\``)

            await m.send(`you have been kicked from ${message.guild.name}`, embed).catch(() => {})
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
