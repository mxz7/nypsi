const { MessageEmbed } = require("discord.js")
const { getColor } = require("../utils.js")

module.exports = {
    name: "kick",
    description: "generic kick command",
    category: "moderation",
    run: async (message, args) => {

        if (!message.member.hasPermission("KICK_MEMBERS")) {
            return 
        }

        if (!message.guild.me.hasPermission("KICK_MEMBERS")) {
            return message.channel.send("❌ \ni am lacking permission: 'KICK_MEMBERS'");
        }

        const color = getColor(message.member);

        if (message.mentions.members.first() == null || args.length == 0) {

            const embed = new MessageEmbed()
                .setTitle("kick help")
                .setColor(color)
                .addField("usage", "$kick <@user(s)> (reason) [-s]")
                .addField("help", "**<>** required | **()** optional | **[]** parameter\n" + "**<@users>** you can kick one or more members in one command (must tag them)\n" +
                    "**(reason)** reason for the kick, will be given to all kicked members\n" +
                    "**[-s]** if used, command message will be deleted and the output will be sent to moderator as a DM if possible")
                .addField("examples", "$kick @member hacking\n$kick @member @member2 @member3 hacking\n$kick @member hacking -s")
                .setFooter("bot.tekoh.wtf")

            return message.channel.send(embed).catch(() => message.channel.send("❌\n$kick <@user(s)> (reason) [-s]"))
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
            await members.get(member).kick(reason).then(() => {
                count++
            }).catch(() => {
                failed.push(members.get(member).user.tag)
            })
        }

        const embed = new MessageEmbed()
            .setTitle("kick | " + message.member.user.username)
            .setDescription("✅ **" + count + "** member(s) kicked for: " + reason.split("| | ")[1])
            .setColor(color)
            .setFooter("bot.tekoh.wtf")

        if (failed.length != 0) {
            embed.addField("error", "unable to kick: " + failed.join(", "))
        }

        if (args.join(" ").includes("-s")) {
            message.delete()
            return message.member.send(embed).catch()
        } else {
            return message.channel.send(embed)
        }
    }
}