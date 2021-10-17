const { Message, Permissions } = require("discord.js")
const { profileExists, createProfile, newCase } = require("../utils/moderation/utils")
const { inCooldown, addCooldown, getPrefix } = require("../utils/guilds/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("kicksince", "kick members that joined after a certain time", categories.ADMIN)
    .setPermissions(["ADMINISTRATOR"])
    .setAliases(["fuckoffsince"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!message.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
        if (message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) {
            return message.channel.send({ embeds: [new ErrorEmbed("you need the `administrator` permission")] })
        }
        return
    }

    if (!message.guild.me.permissions.has(Permissions.FLAGS.KICK_MEMBERS)) {
        return message.channel.send({
            embeds: [new ErrorEmbed("i need the `kick members` permission for this command to work")],
        })
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

        return message.channel.send({ embeds: [embed] })
    }

    const time = new Date().getTime() - getDuration(args[0].toLowerCase()) * 1000

    if (!time) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid time length")] })
    } else if (time < Date.now() - 604800000 && message.author.id != message.guild.ownerID) {
        return message.channel.send({ embeds: [new ErrorEmbed("lol dont even try")] })
    } else if (time < Date.now() - 604800000 * 2) {
        return message.channel.send({ embeds: [new ErrorEmbed("lol dont even try")] })
    }

    let members = await message.guild.members.fetch()

    members = await members.filter((m) => m.joinedTimestamp >= time)

    if (members.size >= 50) {
        const confirm = await message.channel.send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    false,
                    `this will kick **${members.size.toLocaleString()}** members, are you sure?`
                ),
            ],
        })

        await confirm.react("✅")

        const filter = (reaction, user) => {
            return ["✅"].includes(reaction.emoji.name) && user.id == message.member.user.id
        }

        const reaction = await confirm
            .awaitReactions({ filter, max: 1, time: 15000, errors: ["time"] })
            .then((collected) => {
                return collected.first().emoji.name
            })
            .catch(async () => {
                await confirm.reactions.removeAll()
            })

        if (reaction == "✅") {
            await confirm.delete()
        } else {
            return
        }
    }

    let status
    let statusDesc = `\`0/${members.size}\` members kicked..`
    let reason = message.member.user.tag + ": "

    if (members.size >= 15) {
        status = new CustomEmbed(
            message.member,
            false,
            statusDesc + "\n\n - if you'd like to cancel this operation, delete this message"
        ).setTitle(`kick | ${message.author.username}`)
    }

    /**
     * @type {Message}
     */
    let msg

    if (status) {
        msg = await message.channel.send({ embeds: [status] })
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

    for (let member of members.keys()) {
        interval++

        if (status) {
            if (msg.deleted) {
                return message.channel.send({
                    embeds: [new CustomEmbed(message.member, false, "✅ operation cancelled")],
                })
            }
        }

        const targetHighestRole = members.get(member).roles.highest
        const memberHighestRole = message.member.roles.highest

        if (targetHighestRole.position >= memberHighestRole.position && message.guild.ownerId != message.member.user.id) {
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

            if (interval >= 10 && status) {
                statusDesc = `\`${count}/${members.size}\` members kicked..${
                    failed.length != 0 ? `\n - **${failed.length}** failed` : ""
                }`
                status.setDescription(statusDesc + "\n\n - if you'd like to cancel this operation, delete this message")
                let fail = false
                await msg.edit({ embeds: [status] }).catch(() => {
                    fail = true
                })
                if (fail) {
                    return message.channel.send({
                        embeds: [new CustomEmbed(message.member, false, "✅ operation cancelled")],
                    })
                }
                interval = 0
            }
        }
    }

    if (count == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("i was unable to kick any users")] })
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
            embed.setDescription("✅ `" + members.first().user.tag + "` has been kicked for: " + reason.split(": ")[1])
        }
    }

    if (status) {
        msg.delete()
    }

    await message.channel.send({ embeds: [embed] })

    const members1 = Array.from(members.keys())

    if (failed.length != 0) {
        for (let fail of failed) {
            if (members1.includes(fail.id)) {
                members1.splice(members1.indexOf(fail.id), 1)
            }
        }
    }

    newCase(message.guild, "kick", members1, message.author.tag, reason.split(": ")[1])

    for (let member of members1) {
        const m = members.get(member)

        if (reason.split(": ")[1] == "no reason given") {
            await m.send({ content: `you have been kicked from ${message.guild.name}` }).catch(() => {})
        } else {
            const embed = new CustomEmbed(m)
                .setTitle(`kicked from ${message.guild.name}`)
                .addField("reason", `\`${reason.split(": ")[1]}\``)

            await m.send({ content: `you have been kicked from ${message.guild.name}`, embeds: [embed] }).catch(() => {})
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
