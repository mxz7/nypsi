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
            return message.channel.send("❌ i am lacking permissions for this command\npossibly: 'MANAGE_ROLES' or 'MANAGE_CHANNELS'")
        }

        const color = getColor(message.member)

        if (args.length == 0 || message.mentions.members.first() == null) {
            const embed = new MessageEmbed()
                .setTitle("mute help")
                .setColor(color)
                .addField("usage", "$mute <@user(s)> (time) [-s]")
                .addField("help", "to mute multiple people in one command you just have to tag all of those you wish to be muted\nif the mute role isnt setup correctly this wont work\n" +
                    "time format example: 1h30m")
                .setFooter("bot.tekoh.wtf")
            return message.channel.send(embed).catch(() => message.channel.send("$mute <@user(s)> (time in minutes)"))
        }

        const members = message.mentions.members
        let reason = ""

        if (args.length != members.size) {
            for (let i = 0; i < members.size; i++) {
                args.shift()
            }
            reason = args.join(" ").toLowerCase().split(" ")[0]
        }

        let count = 0
        let failed = []

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

        let timedMute = false
        let time = 0

        if (reason != "") {
            timedMute = true

            let time2 = 0

            if (reason.split("h").length > 2 || reason.split("m").length > 2) {
                return message.channel.send("❌ invalid time format - example: $mute @user 1h30m")
            }

            if (!parseInt(reason.split("h").join().split("m").join())) {
                return message.channel.send("❌ invalid time format - example: $mute @user 1h30m")
            }

            if (!reason.includes("h") && !reason.includes("m")) {
                time = parseInt(reason) * 60 * 1000
            } else if (reason.includes("h") && !reason.includes("m")) {
                if (!parseInt(reason.split("h")[0])) {
                    return message.channel.send("❌ invalid time format - example: $mute @user 1h30m")
                }

                time2 = parseInt(reason.split("h")[0])

                time = time2 * 60 * 60 * 1000
            } else if (!reason.includes("h") && reason.includes("m")) {
                if (!parseInt(reason.split("m")[0])) {
                    return message.channel.send("❌ invalid time format - example: $mute @user 1h30m")
                }

                time2 = parseInt(reason.split("m")[0])

                time = time2 * 60 * 1000
            } else if (reason.includes("h") && reason.includes("m")) {
                if (!parseInt(reason.split("h")[0]) || !parseInt(reason.split("m")[0])) {
                    return message.channel.send("❌ invalid time format - example: $mute @user 1h30m")
                }

                const hours = parseInt(reason.split("h")[0])
                const minutes = parseInt(reason.split("h")[1].split("m")[0])


                time = (hours * 60 * 60 * 1000) + (minutes * 60 * 1000)
            } else {
                if (!parseInt(reason)) {
                    return message.channel.send("❌ invalid time format - example: $mute @user 1h30m")
                }
            }
        }

        let fail = false

        for (member of members.keyArray()) {
            const targetHighestRole = members.get(member).roles.highest
            const memberHighestRole = message.member.roles.highest

            if (targetHighestRole.position >= memberHighestRole.position && message.guild.owner.user.id != message.member.user.id) {
                failed.push(members.get(member).user.tag)
            } else {
                await members.get(member).roles.add(muteRole).then(() => count++).catch(() => {
                    fail = true
                    return message.channel.send("❌ i am unable to give users the mute role - ensure my role is above the 'muted' role")
                })
            }
            if (fail) break
        }

        if (fail) return

        let mutedLength = ""

        if (timedMute) {
            setTimeout( async () => {
                for (member of members.keyArray()) {
                    await members.get(member).roles.remove(muteRole).catch()
                }
            }, time)
            mutedLength = getTime(time)
        }

        if (count == 0) {
            return message.channel.send("❌ i was unable to mute any users")
        }

        const embed = new MessageEmbed()
            .setTitle("mute | " + message.member.user.username)
            .setDescription("✅ **" + count + "** member(s) muted")
            .setColor(color)
            .setFooter("bot.tekoh.wtf")

        if (timedMute) {
            embed.setDescription("✅ **" + count + "** member(s) muted for **" + mutedLength + "**")
        }

        if (failed.length != 0) {
            embed.addField("error", "unable to mute: " + failed.join(", "))
        }

        if (args.join(" ").includes("-s")) {
            message.delete()
            return message.member.send(embed).catch()
        } else {
            return message.channel.send(embed)
        }

    }
}

function getTime(ms) {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000))
    const daysms = ms % (24 * 60 * 60 * 1000)
    const hours = Math.floor((daysms) / (60*60*1000))
    const hoursms = ms % (60 * 60 * 1000)
    const minutes = Math.floor((hoursms) / (60 * 1000))
    const minutesms = ms % (60 * 1000)
    const sec = Math.floor((minutesms) / (1000))

    let output = ""

    if (days > 0) {
        output = output + days + "d "
    }

    if (hours > 0) {
        output = output + hours + "h "
    }

    if (minutes > 0) {
        output = output + minutes + "m "
    }

    if (sec > 0) {
        output = output + sec + "s"
    }

    return output
}