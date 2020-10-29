const { Message } = require("discord.js")
const { inCooldown, addCooldown, getPrefix } = require("../guilds/utils")
const { profileExists, createProfile, newCase, isMuted, deleteMute } = require("../moderation/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getExactMember } = require("../utils/utils")

const cmd = new Command("unmute", "unmute one or more users", categories.MODERATION).setPermissions(["MANAGE_MESSAGES"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (!message.member.hasPermission("MANAGE_MESSAGES")) {
        return
    }

    if (!message.guild.me.hasPermission("MANAGE_ROLES") || !message.guild.me.hasPermission("MANAGE_CHANNELS")) {
        return message.channel.send(new ErrorEmbed("i need the `manage roles` and `manage channels` permission for this command to work"))
    }

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        return message.channel.send(new ErrorEmbed(`${prefix}unmute <@user(s)>`))
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
        const member = getExactMember(message, args[0])

        if (!member) {
            return message.channel.send(new ErrorEmbed("unable to find member `" + args[0] + "`"))
        }

        message.mentions.members.set(member.user.id, member)
    }

    const members = message.mentions.members

    let muteRole = message.guild.roles.cache.find(r => r.name.toLowerCase() == "muted")

    if (!muteRole) {
        return message.channel.send(new ErrorEmbed("there is no 'muted' role"))
    }

    let count = 0
    let fail = false
    let failed = []

    for (let member of message.mentions.members.keyArray()) {
        const m = message.mentions.members.get(member)

        if (m.roles.cache.has(muteRole.id)) {
            await m.roles.remove(muteRole).then(() => count++).catch(() => {
                fail = true
                return message.channel.send(new ErrorEmbed("there was an error when removing the role, please ensure i have the correct permissions"))
            })
        } else {
            failed.push(m.user)
        }
        if (fail) break
    }

    if (fail) return

    if (!profileExists(message.guild)) createProfile(message.guild)

    const embed = new CustomEmbed(message.member, false, "✅ **" + count + "** member(s) unmuted")
        .setTitle("unmute | " + message.member.user.username)

    if (count == 1) {
        embed.setDescription("✅ `" + message.mentions.members.first().user.tag + "` has been unmuted")
    }

    if (count == 0) {
        return message.channel.send(new ErrorEmbed("i was unable to unmute any users"))
    }

    if (failed.length != 0) {
        const failedTags = []
        for (let fail1 of failed) {
            failedTags.push(fail1.tag)
        }

        embed.addField("error", "unable to unmute: " + failedTags.join(", "))
    }

    if (args.join(" ").includes("-s")) {
        message.delete()
        await message.member.send(embed).catch(() => {})
    } else {
        await message.channel.send(embed)
    }

    const members1 = members.keyArray()

    if (failed.length != 0) {
        for (let fail1 of failed) {
            if (members1.includes(fail1.id)) {
                members1.splice(members1.indexOf(fail1.id), 1)
            }
        }
    }

    for (let m of members1) {
        if (isMuted(message.guild, members.get(m))) {
            deleteMute(message.guild, members.get(m))
        }
    }

    newCase(message.guild, "unmute", members1, message.author.tag, message.content)
}

cmd.setRun(run)

module.exports = cmd