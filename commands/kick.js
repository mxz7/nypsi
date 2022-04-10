const { Message, Permissions } = require("discord.js")
const { profileExists, createProfile, newCase } = require("../utils/moderation/utils")
const { inCooldown, addCooldown, getPrefix } = require("../utils/guilds/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("kick", "kick one or more users", categories.MODERATION)
    .setPermissions(["KICK_MEMBERS"])
    .setAliases(["fuckoff"])

cmd.slashEnabled = true
cmd.slashData
    .addUserOption((option) => option.setName("user").setDescription("user to kick").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("reason for kick").setRequired(true))

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    const send = async (data) => {
        if (message.interaction) {
            await message.reply(data)
            return await message.fetchReply()
        } else {
            return await message.channel.send(data)
        }
    }

    if (!message.member.permissions.has(Permissions.FLAGS.KICK_MEMBERS)) {
        if (message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) {
            return send({ embeds: [new ErrorEmbed("you need the `kick members` permission")] })
        }
        return
    }

    if (!message.guild.me.permissions.has(Permissions.FLAGS.KICK_MEMBERS)) {
        return send({
            embeds: [new ErrorEmbed("i need the `kick members` permission for this command to work")],
        })
    }

    if (!profileExists(message.guild)) createProfile(message.guild)

    const prefix = getPrefix(message.guild)

    if (args.length == 0 || !args[0]) {
        const embed = new CustomEmbed(message.member)
            .setTitle("kick help")
            .addField("usage", `${prefix}kick <@user(s)> (reason) [-s]`)
            .addField(
                "help",
                "**<>** required | **()** optional | **[]** parameter\n" +
                    "**<@users>** you can kick one or more members in one command (must tag them)\n" +
                    "**(reason)** reason for the kick, will be given to all kicked members\n" +
                    "**[-s]** if used, command message will be deleted and the output will be sent to moderator as a DM if possible"
            )
            .addField(
                "examples",
                `${prefix}kick @member hacking\n${prefix}kick @member @member2 @member3 hacking\n${prefix}kick @member hacking -s`
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
            return send({
                embeds: [new ErrorEmbed("unable to find member with ID `" + args[0] + "`")],
            })
        }

        message.mentions.members.set(member.user.id, member)
    } else if (message.mentions.members.first() == null) {
        return send({
            embeds: [new ErrorEmbed("unable to find member with ID `" + args[0] + "`")],
        })
    }

    const members = message.mentions.members
    let reason = message.member.user.tag + ": "

    if (args.length != members.size) {
        for (let i = 0; i < members.size; i++) {
            args.shift()
        }
        reason = reason + args.join(" ")
    } else {
        reason = reason + "no reason given"
    }

    let count = 0
    let failed = []

    for (let member of members.keys()) {
        const targetHighestRole = members.get(member).roles.highest
        const memberHighestRole = message.member.roles.highest

        if (targetHighestRole.position >= memberHighestRole.position && message.guild.ownerId != message.member.user.id) {
            failed.push(members.get(member).user)
        } else {
            if (members.get(member).user.id == message.client.user.id) {
                await send({ content: "well... i guess this is goodbye ):" })
                await message.guild.leave()
                return
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
        }
    }

    if (count == 0) {
        return send({ embeds: [new ErrorEmbed("i was unable to kick any users")] })
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

    if (args.join(" ").includes("-s")) {
        await message.delete()
        await message.member.send({ embeds: [embed] }).catch()
    } else {
        await send({ embeds: [embed] })
    }

    const members1 = Array.from(members.keys())

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
            await m.send({ content: `you have been kicked from ${message.guild.name}` })
        } else {
            const embed = new CustomEmbed(m)
                .setTitle(`kicked from ${message.guild.name}`)
                .addField("reason", `\`${reason.split(": ")[1]}\``)

            await m.send({ content: `you have been kicked from ${message.guild.name}`, embeds: [embed] })
        }
    }
}

cmd.setRun(run)

module.exports = cmd
