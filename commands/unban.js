const { MessageEmbed } = require("discord.js")
const { getColor } = require("../utils/utils")

module.exports = {
    name: "unban",
    description: "unban one or more users",
    category: "moderation",
    run: async (message, args) => {
        const color = getColor(message.member);

        if (!message.member.hasPermission("BAN_MEMBERS")) {
            if (message.member.hasPermission("MANAGE_MESSAGES")) {
                const embed = new MessageEmbed()
                    .setTitle("unban")
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

        if (args.length == 0) {
            const embed = new MessageEmbed()
                .setTitle("ban help")
                .setColor(color)
                .addField("usage", "$unban <user(s)> [-s]")
                .addField("help", "**<>** required | **[]** parameter\n" + "**<users>** you can unban one or more members in one command\n" +
                    "**[-s]** if used, command message will be deleted and the output will be sent to moderator as a DM if possible")
                .addField("examples", "$unban 123456789012345678\n$unban 123456789012345678 123456789012345678 -s")
                .setFooter("bot.tekoh.wtf")

            return message.channel.send(embed).catch(() => message.channel.send("❌ $unban <user(s)> [-s]"))
        }

        const members = []
        const failed = []

        for (arg of args) {
            if (arg.length == 18) {
                await message.guild.members.unban(arg, message.member.user.tag).then(user => {
                    members.push(user.username + "#" + user.discriminator)
                }).catch(() => {
                    failed.push(arg)
                })
            } else if (arg.toLowerCase() != "-s") {
                try {
                    const memberCache = message.client.users.cache

                    const findingMember = memberCache.find(m => (m.username + "#" + m.discriminator).includes(arg))

                    if (findingMember) {
                        const id = findingMember.id
                        await message.guild.members.unban(id, message.member.user.tag).then(user => {
                            members.push(user.username + "#" + user.discriminator)
                        }).catch(() => {
                            failed.push(arg)
                        })
                    }
                } catch {}
            }
        }

        if (members.length == 0) {
            return message.channel.send("i was unable to unban any users")
        }

        const embed = new MessageEmbed()
            .setTitle("unban")
            .setColor(color)
            .setFooter("bot.tekoh.wtf")

        if (members.length == 1) {
            embed.setDescription("✅ `" + members[0] + "` was unbanned")
        } else {
            embed.setDescription("✅ **" + members.length + "** members have been unbanned")
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
}