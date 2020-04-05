const { MessageEmbed } = require("discord.js")


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

        if (message.mentions.members.first() == null) {
            message.channel.send("❌ \n$kick <@user(s)> (reason)");
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
            await members.get(member).kick(reason).then(() => {
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
            .setTitle("kick")
            .setDescription("✅ **" + count + "** member(s) kicked for: " + reason.split("| | ")[1])
            .setColor(color)
            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")

        if (failed.length != 0) {
            embed.addField("error", "unable to kick: " + failed.join(", "))
        }

        if (args.join(" ").includes("-s")) {
            message.delete()
            return message.member.send(embed)
        } else {
            return message.channel.send(embed)
        }
    }
}