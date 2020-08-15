const { MessageEmbed } = require("discord.js")
const { getColor } = require("../utils/utils");
const { newCase, profileExists, createProfile } = require("../moderation/utils");

module.exports = {
    name: "warn",
    description: "warn one or more users",
    category: "moderation",
    permissions: ["MANAGE_MESSAGES"],
    run: async (message, args) => {

        if (!message.member.hasPermission("MANAGE_MESSAGES")) return
        
        const color = getColor(message.member)

        if (message.mentions.members.first() == null || args.length == 0) {
            const embed = new MessageEmbed()
                .setTitle("warn help")
                .setColor(color)
                .addField("usage", "$warn <@user(s)> (reason) [-s")
                .addField("help", "**<>** required | **()** optional | **[]** parameter\n" + "**<@users>** you can warn one or more members in one command (must tag them)\n" +
                    "**(reason)** reason for the warn, will be given to all warned members\n" +
                    "**[-s]** if used, command message will be deleted and the output will be sent to moderator as a DM if possible")
                .addField("examples", "$warn @member toxicity\n$warn @member @member2 toxicity")
                .setFooter("bot.tekoh.wtf")
            
            return message.channel.send(embed)
        }

        const members = message.mentions.members
        let reason

        if (args.length != members.size) {
            for (let i = 0; i < members.size; i++) {
                args.shift()
            }
            reason = args.join(" ")
        } else {
            return message.channel.send("❌ you must include a warn reason")
        }

        let count = 0
        let failed = []

        const messageDM = "you have been warned in **" + message.guild.name + "** for `" + reason + "`"

        if (!profileExists(message.guild)) createProfile(message.guild)

        for (member of members.keyArray()) {
            const targetHighestRole = members.get(member).roles.highest
            const memberHighestRole = message.member.roles.highest

            if (targetHighestRole.position >= memberHighestRole.position && message.guild.owner.user.id != message.member.user.id) {
                failed.push(members.get(member).user.tag)
            } else {
                await members.get(member).send(messageDM).catch(() => {})
                count++
                newCase(message.guild, "warn", members.get(member).user.id, message.member.user.tag, message.content)
            }
        }

        if (count == 0) {
            return message.channel.send("❌ i was unable to warn any users")
        }

        const embed = new MessageEmbed()
            .setTitle("warn | " + message.member.user.username)
            .setDescription("✅ **" + count + "** members warned for: " + reason)
            .setColor(color)
            .setFooter("bot.tekoh.wtf")
        
        if (count == 1) {
            embed.setDescription("✅ `" + members.first().user.tag + "` has been warned for: " + reason)
        }

        if (failed.length != 0) {
            embed.addField("error", "unable to warn: " + failed.join(", "))
        }

        if (args.join(" ").includes("-s")) {
            await message.delete()
            await message.member.send(embed).catch()
        } else {
            await message.channel.send(embed)
        }
    }
}