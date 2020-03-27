const { MessageEmbed } = require("discord.js")


module.exports = {
    name: "ban",
    description: "generic ban command",
    category: "moderation",
    run: async (message, args) => {
        
        if (!message.member.hasPermission("BAN_MEMBERS")) {
            return 
        }

        if (!message.guild.me.hasPermission("BAN_MEMBERS")) {
            return message.channel.send("❌ \ni am lacking permission: 'BAN_MEMBERS'");
        }

        if (message.mentions.members.first() == null) {
            message.channel.send("❌\n$ban <@user(s)> (reason)");
            return;
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
            await message.guild.members.ban(member, {
                days: 1,
                reason: reason
            }).then(() => {
                count++
            }).catch(() => {
                failed.push(members.get(member).user.tag)
            })
        }

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new MessageEmbed()
            .setTitle("ban")
            .setDescription("✅ **" + count + "** member(s) banned for: " + reason.split("| | ")[1])
            .setColor(color)
            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")

        if (failed.length != 0) {
            embed.addField("error", "unable to ban: " + failed.join(", "))
        }
        
        return message.channel.send(embed)

    }
};