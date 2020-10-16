const { Message } = require("discord.js");
const { profileExists, createProfile, newCase } = require("../moderation/utils");
const { inCooldown, addCooldown, getPrefix } = require("../guilds/utils");
const { Command, categories } = require("../utils/classes/Command");
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("kick", "kick one or more users", categories.INFO).setPermissions(["KICK_MEMBERS"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {
        
    if (!message.member.hasPermission("KICK_MEMBERS")) {
        if (message.member.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send(new ErrorEmbed("requires permission: *KICK_MEMBERS*"))
        }
        return 
    }

    if (!message.guild.me.hasPermission("KICK_MEMBERS")) {
        return message.channel.send(new ErrorEmbed("i am lacking permission: 'KICK_MEMBERS'"));
    }

    const prefix = getPrefix(message.guild)

    if (args.length == 0 && message.mentions.members.first() == null) {

        const embed = new CustomEmbed(message.member)
            .setTitle("kick help")
            .addField("usage", `${prefix}kick <@user(s)> (reason) [-s]`)
            .addField("help", "**<>** required | **()** optional | **[]** parameter\n" + "**<@users>** you can kick one or more members in one command (must tag them)\n" +
                "**(reason)** reason for the kick, will be given to all kicked members\n" +
                "**[-s]** if used, command message will be deleted and the output will be sent to moderator as a DM if possible")
            .addField("examples", `${prefix}kick @member hacking\n${prefix}kick @member @member2 @member3 hacking\n${prefix}kick @member hacking -s`)

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

        const member = members.find(m => m.id == args[0])

        if (!member) {
            return message.channel.send(new ErrorEmbed("unable to find member with ID `" + args[0] + "`"))
        }
        
        message.mentions.members.set(member.user.id, member)
    } else if (message.mentions.members.first() == null) {
        return message.channel.send(new ErrorEmbed("unable to find member with ID `" + args[0] + "`"))
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

    for (member of members.keyArray()) {
        const targetHighestRole = members.get(member).roles.highest
        const memberHighestRole = message.member.roles.highest

        if (targetHighestRole.position >= memberHighestRole.position && message.guild.owner.user.id != message.member.user.id) {
            failed.push(members.get(member).user.tag)
        } else {
            await members.get(member).kick(reason).then(() => {
                count++
            }).catch(() => {
                failed.push(members.get(member).user.tag)
            })
        }
    }

    if (count == 0) {
        return message.channel.send(new ErrorEmbed("i was unable to kick any users"))
    }

    const embed = new CustomEmbed(message.member)
        .setTitle("kick | " + message.member.user.username)

    if (reason.split(": ")[1] == "no reason given" && count != 1) {
        embed.setDescription(`✅ **${count}** members kicked`)
    } else {
        embed.setDescription(`✅ **${count}** members kicked for: ${reason.split(": ")[1]}`)
    }

    if (failed.length != 0) {
        embed.addField("error", "unable to kick: " + failed.join(", "))
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
        await message.member.send(embed).catch()
    } else {
        await message.channel.send(embed)
    }

    if (!profileExists(message.guild)) createProfile(message.guild)

    for (member of members.keyArray()) {
        const m = members.get(member)
        if (failed.indexOf(m.user.tag) == -1) {
            newCase(message.guild, "kick", m.user.id, message.member.user.tag, reason.split(": ")[1])

            if (reason.split(": ")[1] == "no reason given") {
                await m.send(`you have been kicked from ${message.guild.name}`)
            } else {
                const embed = new CustomEmbed(m)
                    .setTitle(`kicked from ${message.guild.name}`)
                    .addField("reason", `\`${reason.split(": ")[1]}\``)

                await m.send(`you have been kicked from ${message.guild.name}`, embed)
            }
        }
    }

}

cmd.setRun(run)

module.exports = cmd