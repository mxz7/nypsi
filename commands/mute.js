const { MessageEmbed } = require("discord.js")
const { getColor } = require("../utils.js")

module.exports = {
    name: "mute",
    description: "mute one or more users",
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
            const embed = new MessageEmbed()
                .setTitle("mute help")
                .setColor(color)
                .addField("usage", "$mute <@user(s)> (time in minutes)")
                .addField("help", "to mute multiple people in one command you just have to tag all of those you wish to be muted\nif the mute role isnt setup correctly this wont work")
                .setFooter("bot.tekoh.wtf")
            return message.channel.send(embed).catch(() => message.channel.send("$mute <@user(s)> (time in minutes)"))
        }

        if (message.mentions.members.first() == null || args.length == 0) {
            return message.channel.send("help")
        }

        const members = message.mentions.members
        let reason = ""

        if (args.length != members.size) {
            for (let i = 0; i < members.size; i++) {
                args.shift()
            }
            reason = args.join(" ")
            reason = reason.replace(/\D/g,'')
        }

        let count = 0

        let muteRole = message.guild.roles.cache.find(r => r.name.toLowerCase() == "muted")

        if (!muteRole) {
            try {
                muteRole = await message.guild.roles.create({
                    data: {
                        name: "muted"
                    }
                })

                message.guild.channels.cache.forEach(async channel => {
                    await channel.updateOverwrite(muteRole, {
                        SEND_MESSAGES: false,
                        SPEAK: false,
                        ADD_REACTIONS: false
                    })
                })

            } catch (e) {
                return message.channel.send("❌ i am lacking permissions to do this")
            }
        }

        for (member of members.keyArray()) {
            await members.get(member).roles.add(muteRole).then(() => count++)
        }

        if (count == 0) {
            return message.channel.send("❌ i was unable to mute any users")
        }

        let timedMute = false
        let time = 0

        if (reason != "") {
            timedMute = true
            time = parseInt(reason) * 60 * 1000
        }

        if (timedMute) {
            setTimeout( async () => {
                for (member of members.keyArray()) {
                    await members.get(member).remove(muteRole).catch()
                }
            }, time)
        }

        const embed = new MessageEmbed()
            .setTitle("mute | " + message.member.user.username)
            .setDescription("✅ **" + count + "** member(s) muted")
            .setColor(color)
            .setFooter("bot.tekoh.wtf")

        if (args.join(" ").includes("-s")) {
            message.delete()
            return message.member.send(embed).catch()
        } else {
            return message.channel.send(embed)
        }

    }
}