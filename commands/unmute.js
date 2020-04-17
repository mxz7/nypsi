const { MessageEmbed } = require("discord.js")
const { getColor } = require("../utils.js")

module.exports = {
    name: "unmute",
    description: "unmute one or more users",
    category: "moderation",
    run: async (message, args) => {
        if (!message.member.hasPermission("MANAGE_MESSAGES")) {
            return
        }

        if (!message.guild.me.hasPermission("MANAGE_ROLES") || !message.guild.me.hasPermission("MANAGE_CHANNELS")) {
            return message.channel.send("❌ i am lacking permissions for this command")
        }

        const color = getColor(message.member)

        if (args.length == 0) {
            return message.channel.send("❌ $unmute <@user(s)>")
        }

        let muteRole = message.guild.roles.cache.find(r => r.name.toLowerCase() == "muted")

        if (!muteRole) {
            return message.channel.send("❌ there is no 'muted' role")
        }

        let count = 0

        for (member of message.mentions.members.keyArray()) {
            const m = message.mentions.members.get(member)

            if (m.roles.cache.has(muteRole.id)) {
                await m.roles.remove(muteRole).then(() => {
                    count++
                })
            }
        }

        const embed = new MessageEmbed()
            .setTitle("unmute | " + message.member.user.username)
            .setDescription("✅ **" + count + "** member(s) unmuted")
            .setColor(color)
            .setFooter("bot.tekoh.wtf")

        
        return message.channel.send(embed)
    }
}