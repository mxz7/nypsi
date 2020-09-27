const { MessageEmbed, Message } = require("discord.js");
const { getColor } = require("../utils/utils")
const { profileExists, createProfile, newCase, newMute, isMuted, deleteMute } = require("../moderation/utils")
const { inCooldown, addCooldown } = require("../guilds/utils");

module.exports = {
    name: "mute",
    description: "mute one or more users",
    category: "moderation",
    permissions: ["MANAGE_MESSAGES"],
    /**
     * @param {Message} message 
     * @param {Array} args 
     */
    run: async (message, args) => {

        if (!message.member.hasPermission("MANAGE_MESSAGES")) {
            return
        }

        if (!message.guild.me.hasPermission("MANAGE_ROLES") || !message.guild.me.hasPermission("MANAGE_CHANNELS")) {
            return message.channel.send("❌ i am lacking permissions for this command\npossibly: 'MANAGE_ROLES' or 'MANAGE_CHANNELS'")
        }

        const color = getColor(message.member)

        if (args.length == 0 && message.mentions.members.first() == null) {
            const embed = new MessageEmbed()
                .setTitle("mute help")
                .setColor(color)
                .addField("usage", "$mute <@user(s)> (time) [-s]")
                .addField("help", "to mute multiple people in one command you just have to tag all of those you wish to be muted\nif the mute role isnt setup correctly this wont work")
                .addField("time format examples", "**1d** *1 day*\n**10h** *10 hours*\n**15m** *15 minutes*\n**30s** *30 seconds*")
                .setFooter("bot.tekoh.wtf")
            return message.channel.send(embed).catch(() => message.channel.send("$mute <@user(s)> (time in minutes)"))
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
                return message.channel.send("❌ unable to find member with ID `" + args[0] + "`")
            }
            
            message.mentions.members.set(member.user.id, member)
        } else if (message.mentions.members.first() == null) {
            return message.channel.send("❌ unable to find member with ID `" + args[0] + "`")
        }

        const members = message.mentions.members
        let reason = ""

        if (args.length != members.size) {
            for (let i = 0; i < members.size; i++) {
                args.shift()
            }
            reason = args.join(" ")
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
        let unmuteDate
        let time = 0

        if (reason != "") {
            time = getDuration(reason.split(" ")[0])
            unmuteDate = new Date().getTime() + (time * 1000)

            if (time) {
                timedMute = true
            }
        }

        let fail = false

        for (member of members.keyArray()) {
            const targetHighestRole = members.get(member).roles.highest
            const memberHighestRole = message.member.roles.highest

            if (targetHighestRole.position >= memberHighestRole.position && message.guild.owner.user.id != message.member.user.id) {
                failed.push(members.get(member).user.tag)
            } else if (members.get(member).roles.cache.find(r => r.id == muteRole.id)) {

                if (members.keyArray().length == 1) {
                    return message.channel.send("❌ that user is already muted")
                }

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

        if (timedMute && time < 3600) {
            setTimeout( async () => {
                for (member of members.keyArray()) {
                    await members.get(member).roles.remove(muteRole).catch()
                }
            }, time * 1000)
        }

        if (timedMute) {
            mutedLength = getTime(time * 1000)
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
            if (count == 1) {
                embed.setDescription("✅ `" + members.first().user.tag + "` has been muted for **" + mutedLength + "**")
            } else {
                embed.setDescription("✅ **" + count + "** members muted for **" + mutedLength + "**")
            }
        } else {
            if (count == 1) {
                embed.setDescription("✅ `" + members.first().user.tag + "` has been muted")
            } else {
                embed.setDescription("✅ **" + count + "** members muted")
            }
        }

        if (failed.length != 0) {
            embed.addField("error", "unable to mute: " + failed.join(", "))
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
                newCase(message.guild, "mute", members.get(member).user.id, message.member.user.tag, reason)

                if (time >= 3600) {
                    if (isMuted(message.guild, members.get(member))) {
                        deleteMute(message.guild, members.get(member))
                    }
    
                    newMute(message.guild, members.get(member), unmuteDate)
                }

                
                if (!timedMute) {
                    await m.send("you have been muted in **" + message.guild.name + "** for `" + reason + "` (permanent)").catch()
                    newMute(message.guild, members.get(member), 9999999999999)
                } else {
                    await m.send("you have been muted in **" + message.guild.name + "** for `" + reason + "`").catch()
                }
            }
        }

    }
}

function getDuration(duration) {
    duration.toLowerCase()

    if (duration.includes("d")) {
        if (!parseInt(duration.split("d")[0])) return undefined

        const num = duration.split("d")[0]

        return num * 86400
    } else if (duration.includes("h")) {
        if (!parseInt(duration.split("h")[0])) return undefined

        const num = duration.split("h")[0]

        return num * 3600
    } else if (duration.includes("m")) {
        if (!parseInt(duration.split("m")[0])) return undefined

        const num = duration.split("m")[0]

        return num * 60
    } else if (duration.includes("s")) {
        if (!parseInt(duration.split("s")[0])) return undefined

        const num = duration.split("s")[0]

        return num
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