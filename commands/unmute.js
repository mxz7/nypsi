const { Message } = require("discord.js");
const { inCooldown, addCooldown, getPrefix } = require("../guilds/utils");
const { profileExists, createProfile, newCase, isMuted, deleteMute } = require("../moderation/utils");
const { Command, categories } = require("../utils/classes/Command");
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

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
        return message.channel.send(new ErrorEmbed("i am lacking permissions for this command\npossibly: 'MANAGE_ROLES' or 'MANAGE_CHANNELS'"))
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
        return message.channel.send(new ErrorEmbed("unable to find member with ID `" + args[0] + "`"))
    }

    const members = message.mentions.members

    let muteRole = message.guild.roles.cache.find(r => r.name.toLowerCase() == "muted")

    if (!muteRole) {
        return message.channel.send(new ErrorEmbed("there is no 'muted' role"))
    }

    let count = 0
    let fail = false
    let failed = []

    for (member of message.mentions.members.keyArray()) {
        const m = message.mentions.members.get(member)

        if (m.roles.cache.has(muteRole.id)) {
            await m.roles.remove(muteRole).then(() => count++).catch(() => {
                fail = true
                return message.channel.send(new ErrorEmbed("there was an error when removing the role, please ensure i have the correct permissions"))
            })
        } else {
            failed.push(m.user.tag)
        }
        if (fail) break
    }

    if (fail) return

    if (!profileExists(message.guild)) createProfile(message.guild)

    for (member of message.mentions.members.keyArray()) {
        if (failed.indexOf(message.mentions.members.get(member).user.tag) == -1) {
            newCase(message.guild, "unmute", message.mentions.members.get(member).user.id, message.member.user.tag, message.content)

            if (isMuted(message.guild, message.mentions.members.get(member))) {
                deleteMute(message.guild, message.mentions.members.get(member))
            }
        }
    }

    const embed = new CustomEmbed(message.member, false, "✅ **" + count + "** member(s) unmuted")
        .setTitle("unmute | " + message.member.user.username)

    if (count == 1) {
        embed.setDescription("✅ `" + message.mentions.members.first().user.tag + "` has been unmuted")
    }

    if (count == 0) {
        return message.channel.send(new ErrorEmbed("i was unable to unmute any users"))
    }

    if (failed.length != 0) {
        embed.addField("error", "unable to unmute: " + failed.join(", "))
    }

    if (args.join(" ").includes("-s")) {
        message.delete()
        return message.member.send(embed).catch(() => {})
    } else {
        return message.channel.send(embed)
    }

}

cmd.setRun(run)

module.exports = cmd