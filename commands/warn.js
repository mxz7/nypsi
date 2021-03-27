const { Message } = require("discord.js")
const { newCase, profileExists, createProfile } = require("../moderation/utils")
const { inCooldown, addCooldown, getPrefix } = require("../guilds/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getExactMember } = require("../utils/utils")

const cmd = new Command("warn", "warn one or more users", categories.MODERATION).setPermissions([
    "MANAGE_MESSAGES",
])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!message.member.hasPermission("MANAGE_MESSAGES")) return

    const prefix = getPrefix(message.guild)

    if (args.length == 0 && message.mentions.members.first() == null) {
        const embed = new CustomEmbed(message.member)
            .setTitle("warn help")
            .addField("usage", `${prefix}warn <@user(s)> (reason) [-s`)
            .addField(
                "help",
                "**<>** required | **()** optional | **[]** parameter\n" +
                    "**<@users>** you can warn one or more members in one command (must tag them)\n" +
                    "**(reason)** reason for the warn, will be given to all warned members\n" +
                    "**[-s]** if used, command message will be deleted and the output will be sent to moderator as a DM if possible\n\n" +
                    "if the bot was unable to DM a user on warn, the warning will still be logged"
            )
            .addField(
                "examples",
                `${prefix}warn @member toxicity\n${prefix}warn @member @member2 toxicity`
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
            return message.channel.send(
                new ErrorEmbed("unable to find member with ID `" + args[0] + "`")
            )
        }

        message.mentions.members.set(member.user.id, member)
    } else if (message.mentions.members.first() == null) {
        const member = await getExactMember(message, args[0])

        if (!member) {
            return message.channel.send(new ErrorEmbed("unable to find member `" + args[0] + "`"))
        }

        message.mentions.members.set(member.user.id, member)
    }

    const members = message.mentions.members
    let reason

    if (args.length != members.size) {
        for (let i = 0; i < members.size; i++) {
            args.shift()
        }
        reason = args.join(" ")
    } else {
        return message.channel.send(new ErrorEmbed("you must include a warn reason"))
    }

    let count = 0
    let failed = []
    let error = []

    const messageDM = "you have been warned in **" + message.guild.name + "** for `" + reason + "`"

    if (!profileExists(message.guild)) createProfile(message.guild)

    for (let member of members.keyArray()) {
        const targetHighestRole = members.get(member).roles.highest
        const memberHighestRole = message.member.roles.highest

        if (
            targetHighestRole.position >= memberHighestRole.position &&
            message.guild.owner.user.id != message.member.user.id
        ) {
            failed.push(members.get(member).user)
        } else {
            const embed = new CustomEmbed(members.get(member))
                .setTitle(`warned in ${message.guild.name}`)
                .addField("reason", `\`${reason}\``)

            await members
                .get(member)
                .send(`you have been warned in ${message.guild.name}`, embed)
                .catch(() => {
                    error.push(members.get(member).user)
                })
            count++
        }

        if (members.get(member).user.id == message.client.user.id) {
            await message.channel.send("wow... 😢")
        }
    }

    if (count == 0) {
        return message.channel.send(new ErrorEmbed("i was unable to warn any users"))
    }

    const embed = new CustomEmbed(
        message.member,
        false,
        "✅ **" + count + "** members warned for: " + reason
    ).setTitle("warn | " + message.member.user.username)

    if (count == 1 && failed.length == 0) {
        embed.setDescription("✅ `" + members.first().user.tag + "` has been warned for: " + reason)
    }

    if (failed.length != 0) {
        const failedTags = []
        for (let fail of failed) {
            failedTags.push(fail.tag)
        }

        embed.addField("error", "unable to warn: " + failedTags.join(", "))
    }

    if (error.length != 0) {
        const errorTags = []
        for (let err of error) {
            errorTags.push(err.tag)
        }

        embed.addField("warning", "unable to DM: " + errorTags.join(", "))
    }

    if (args.join(" ").includes("-s")) {
        await message.delete()
        await message.member.send(embed).catch()
    } else {
        await message.channel.send(embed)
    }

    const members1 = members.keyArray()

    if (failed.length != 0) {
        for (let fail of failed) {
            if (members1.includes(fail.id)) {
                members1.splice(members1.indexOf(fail.id), 1)
            }
        }
    }

    newCase(message.guild, "warn", members1, message.author.tag, reason)
}

cmd.setRun(run)

module.exports = cmd
