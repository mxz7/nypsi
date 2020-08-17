const { MessageEmbed } = require("discord.js")
const { getColor } = require("../utils/utils");
const { profileExists, createProfile, newCase } = require("../moderation/utils");
const { inCooldown, addCooldown } = require("../guilds/utils");

module.exports = {
    name: "kick",
    description: "kick one or more users",
    category: "moderation",
    permissions: ["KICK_MEMBERS"],
    run: async (message, args) => {

        const color = getColor(message.member);
        
        if (!message.member.hasPermission("KICK_MEMBERS")) {
            if (message.member.hasPermission("MANAGE_MESSAGES")) {
                const embed = new MessageEmbed()
                    .setTitle("kick")
                    .setDescription("❌ requires permission: *KICK_MEMBERS*")
                    .setFooter("bot.tekoh.wtf")
                    .setColor(color)
                return message.channel.send(embed)
            }
            return 
        }

        if (!message.guild.me.hasPermission("KICK_MEMBERS")) {
            return message.channel.send("❌ i am lacking permission: 'KICK_MEMBERS'");
        }

        if (args.length == 0 && (args[0].length != 18 && message.mentions.members.first() == null)) {

            const embed = new MessageEmbed()
                .setTitle("kick help")
                .setColor(color)
                .addField("usage", "$kick <@user(s)> (reason) [-s]")
                .addField("help", "**<>** required | **()** optional | **[]** parameter\n" + "**<@users>** you can kick one or more members in one command (must tag them)\n" +
                    "**(reason)** reason for the kick, will be given to all kicked members\n" +
                    "**[-s]** if used, command message will be deleted and the output will be sent to moderator as a DM if possible")
                .addField("examples", "$kick @member hacking\n$kick @member @member2 @member3 hacking\n$kick @member hacking -s")
                .setFooter("bot.tekoh.wtf")

            return message.channel.send(embed).catch(() => message.channel.send("❌ $kick <@user(s)> (reason) [-s]"))
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
        }

        const members = message.mentions.members
        let reason = message.member.user.tag + ": "

        if (args.length != members.size) {
            for (let i = 0; i < members.size; i++) {
                args.shift()
            }
            reason = reason + args.join(" ")
        } else {
            reason = reason + "no reason specified"
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
            return message.channel.send("❌ i was unable to kick any users")
        }

        const embed = new MessageEmbed()
            .setTitle("kick | " + message.member.user.username)
            .setDescription("✅ **" + count + "** members kicked for: " + reason.split(": ")[1])
            .setColor(color)
            .setFooter("bot.tekoh.wtf")

        if (failed.length != 0) {
            embed.addField("error", "unable to kick: " + failed.join(", "))
        }

        if (count == 1) {
            embed.setDescription("✅ `" + members.first().user.tag + "` has been kicked for: " + reason.split(": ")[1])
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

                await m.send("you have been kicked in **" + message.guild.name + "** for `" + reason.split(": ")[1] + "`").catch()
            }
        }
    }
}