const { Message } = require("discord.js")
const { newCase, profileExists, createProfile } = require("../utils/moderation/utils")
const { inCooldown, addCooldown, getPrefix } = require("../utils/guilds/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command(
    "ban",
    "ban one or more users from the server",
    categories.MODERATION
).setPermissions(["BAN_MEMBERS"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!message.member.hasPermission("BAN_MEMBERS")) {
        if (message.member.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send(new ErrorEmbed("you need the `ban members` permission"))
        }
        return
    }

    if (!message.guild.me.hasPermission("BAN_MEMBERS")) {
        return message.channel.send(
            new ErrorEmbed("i need the `ban members` permission for this command to work")
        )
    }

    let idOnly = false

    const prefix = getPrefix(message.guild)

    if (args.length == 0 && message.mentions.members.first() == null) {
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
                `${prefix}ban @member hacking\n${prefix}ban @member @member2 @member3 hacking\n${prefix}ban @member hacking -s`
            )

        return message.channel.send(embed)
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
        return message.channel.send(
            new ErrorEmbed("unable to find member with ID `" + args[0] + "`")
        )
    }

    const members = message.mentions.members
    let reason = message.member.user.tag + ": "
    let days = 1

    if (args.length != members.size) {
        for (let i = 0; i < members.size; i++) {
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

    for (let member of members.keyArray()) {
        if (!idOnly) {
            const targetHighestRole = members.get(member).roles.highest
            const memberHighestRole = message.member.roles.highest

            if (
                targetHighestRole.position >= memberHighestRole.position &&
                message.guild.owner.user.id != message.member.user.id
            ) {
                failed.push(members.get(member).user)
                continue
            }

            if (members.get(member).user.id == message.client.user.id) {
                await message.channel.send("well... i guess this is goodbye ):")
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
                    return message.channel.send(
                        new ErrorEmbed(`unable to ban the id: \`${member}\``)
                    )
                }
                failed.push(members.get(member).user)
            })
    }

    if (fail) return

    if (count == 0) {
        return message.channel.send(new ErrorEmbed("i was unable to ban any users"))
    }

    const embed = new CustomEmbed(message.member)
        .setTitle("ban | " + message.member.user.username)
        .setDescription("✅ **" + count + "** members banned for: " + reason.split(": ")[1])

    if (reason.split(": ")[1] == "no reason given") {
        embed.setDescription(`✅ **${count}** members banned`)
    } else {
        embed.setDescription(`✅ **${count}** members banned for: ${reason.split(": ")[1]}`)
    }

    if (count == 1 && failed.length == 0) {
        if (idOnly) {
            if (reason.split(": ")[1] == "no reason given") {
                embed.setDescription(`✅ \`${members.first()}\` has been banned`)
            } else {
                embed.setDescription(
                    `✅ \`${members.first()}\` has been banned for: ${reason.split(": ")[1]}`
                )
            }
        } else {
            if (reason.split(": ")[1] == "no reason given") {
                embed.setDescription("✅ `" + members.first().user.tag + "` has been banned")
            } else {
                embed.setDescription(
                    "✅ `" +
                        members.first().user.tag +
                        "` has been banned for: " +
                        reason.split(": ")[1]
                )
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
        await message.member.send(embed).catch()
    } else {
        await message.channel.send(embed)
    }

    if (!profileExists(message.guild)) createProfile(message.guild)

    if (idOnly) {
        newCase(
            message.guild,
            "ban",
            members.first(),
            message.member.user.tag,
            reason.split(": ")[1]
        )
    } else {
        const members1 = members.keyArray()

        if (failed.length != 0) {
            for (fail of failed) {
                if (members1.includes(fail.id)) {
                    members1.splice(members1.indexOf(fail.id), 1)
                }
            }
        }

        newCase(message.guild, "ban", members1, message.author.tag, reason.split(": ")[1])

        if (args.join(" ").includes("-s")) return
        for (let member of members1) {
            const m = members.get(member)

            if (reason.split(": ")[1] == "no reason given") {
                await m.send(`you have been banned from ${message.guild.name}`)
            } else {
                const embed = new CustomEmbed(m)
                    .setTitle(`banned from ${message.guild.name}`)
                    .addField("reason", `\`${reason.split(": ")[1]}\``)

                await m.send(`you have been banned from ${message.guild.name}`, embed)
            }
        }
    }
}

cmd.setRun(run)

module.exports = cmd
