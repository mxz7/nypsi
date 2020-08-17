const { MessageEmbed } = require("discord.js")
const { getColor } = require("../utils/utils")
const { profileExists, createProfile, newCase, isMuted, deleteMute } = require("../moderation/utils")

module.exports = {
    name: "unmute",
    description: "unmute one or more users",
    category: "moderation",
    permissions: ["MANAGE_MESSAGES"],
    run: async (message, args) => {
        if (!message.member.hasPermission("MANAGE_MESSAGES")) {
            return
        }

        if (!message.guild.me.hasPermission("MANAGE_ROLES") || !message.guild.me.hasPermission("MANAGE_CHANNELS")) {
            return message.channel.send("❌ i am lacking permissions for this command\npossibly: 'MANAGE_ROLES' or 'MANAGE_CHANNELS'")
        }

        const color = getColor(message.member)

        if (args.length == 0 || message.mentions.members.first() == null) {
            return message.channel.send("❌ $unmute <@user(s)>")
        }

        let muteRole = message.guild.roles.cache.find(r => r.name.toLowerCase() == "muted")

        if (!muteRole) {
            return message.channel.send("❌ there is no 'muted' role")
        }

        let count = 0
        let fail = false
        let failed = []

        for (member of message.mentions.members.keyArray()) {
            const m = message.mentions.members.get(member)

            if (m.roles.cache.has(muteRole.id)) {
                await m.roles.remove(muteRole).then(() => count++).catch(() => {
                    fail = true
                    return message.channel.send("❌ there was an error when removing the role, please ensure i have the correct permissions")
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

        const embed = new MessageEmbed()
            .setTitle("unmute | " + message.member.user.username)
            .setDescription("✅ **" + count + "** member(s) unmuted")
            .setColor(color)
            .setFooter("bot.tekoh.wtf")

        if (count == 1) {
            embed.setDescription("✅ `" + message.mentions.members.first().user.tag + "` has been unmuted")
        }

        if (count == 0) {
            return message.channel.send("❌ i was unable to unmute any users")
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
}