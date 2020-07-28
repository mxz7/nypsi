const { MessageEmbed } = require("discord.js")
const { getColor } = require("../utils/utils")

module.exports = {
    name: "ban",
    description: "ban one or more users",
    category: "moderation",
    permissions: ["BAN_MEMBERS"],
    run: async (message, args) => {
        
        const color = getColor(message.member);

        if (!message.member.hasPermission("BAN_MEMBERS")) {
            if (message.member.hasPermission("MANAGE_MESSAGES")) {
                const embed = new MessageEmbed()
                    .setTitle("ban")
                    .setDescription("❌ requires permission: *BAN_MEMBERS*")
                    .setFooter("bot.tekoh.wtf")
                    .setColor(color)
                return message.channel.send(embed)
            }
            return 
        }

        if (!message.guild.me.hasPermission("BAN_MEMBERS")) {
            return message.channel.send("❌ i am lacking permission: 'BAN_MEMBERS'");
        }

        if (message.mentions.members.first() == null || args.length == 0) {

            const embed = new MessageEmbed()
                .setTitle("ban help")
                .setColor(color)
                .addField("usage", "$ban <@user(s)> (reason) [-s]")
                .addField("help", "**<>** required | **()** optional | **[]** parameter\n" + "**<@users>** you can ban one or more members in one command (must tag them)\n" +
                    "**(reason)** reason for the ban, will be given to all banned members\n" +
                    "**[-s]** if used, command message will be deleted and the output will be sent to moderator as a DM if possible")
                .addField("examples", "$ban @member hacking\n$ban @member @member2 @member3 hacking\n$ban @member hacking -s")
                .setFooter("bot.tekoh.wtf")

            return message.channel.send(embed).catch(() => message.channel.send("❌ $ban <@user(s)> (reason) [-s]"))
        }

        const members = message.mentions.members
        let reason = message.member.user.tag + " | | "

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
                await message.guild.members.ban(member, {
                    days: 1,
                    reason: reason
                }).then(() => {
                    count++
                }).catch(() => {
                    failed.push(members.get(member).user.tag)
                })
            }
        }

        if (count == 0) {
            return message.channel.send("❌ i was unable to ban any users")
        }

        const embed = new MessageEmbed()
            .setTitle("ban | " + message.member.user.username)
            .setDescription("✅ **" + count + "** members banned for: " + reason.split("| | ")[1])
            .setColor(color)
            .setFooter("bot.tekoh.wtf")
        
        if (count == 1) {
            embed.setDescription("✅ `" + members.first().user.tag + "` has been banned for: " + reason.split("| | ")[1])
        }

        if (failed.length != 0) {
            embed.addField("error", "unable to ban: " + failed.join(", "))
        }

        if (args.join(" ").includes("-s")) {
            await message.delete()
            return message.member.send(embed).catch()
        } else {
            return message.channel.send(embed)
        }
    }
};