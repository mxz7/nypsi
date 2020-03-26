const { MessageEmbed } = require("discord.js")

const cooldown = new Map()

module.exports = {
    name: "channel",
    description: "create, delete and modify channels",
    category: "moderation",
    run: async (message, args) => {
        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 5 - diff

            const minutes = Math.floor(time / 60)
            const seconds = time - minutes * 60

            let remaining

            if (minutes != 0) {
                remaining = `${minutes}m${seconds}s`
            } else {
                remaining = `${seconds}s`
            }
            return message.channel.send("❌\nstill on cooldown for " + remaining );
        }

        if (!message.member.hasPermission("MANAGE_CHANNELS")) {
            return
        }

        if (!message.guild.me.hasPermission("MANAGE_CHANNELS")) {
            return message.channel.send("❌\ni am lacking permission: 'MANAGE_CHANNELS")
        }

        if (args.length == 0) {
            return message.channel.send("❌\n$channel <**c**reate/**del**ete/**r**ename/nsfw> <channel> (name)")
        }

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        if (args[0] == "create" || args[0] == "c") {
            if (args.length == 1) {
                return message.channel.send("❌\n$channel **c**reate <name1 name2>\nexample: $channel c channel1 channel2")
            }
            args.shift()

            let channels = ""

            for (arg of args) {
                const newChannel = await message.guild.channels.create(arg)
                channels = channels + "**" + newChannel.name + "** ✅\n"
            }

            const embed = new MessageEmbed()
                    .setTitle("channel")
                    .setDescription(channels)
                    .setColor(color)
                    .setFooter(message.member.user.tag + " | bot.tekoh.wtf")
            return message.channel.send(embed)
        }

        if (args[0] == "delete" || args[0] == "del") {
            if (args.length == 1) {
                return message.channel.send("❌\n$channel **del**ete <channel>")
            }

            args.shift()

            let count = 0

            message.mentions.channels.forEach(async channel => {
                count++
                await channel.delete()
            })

            const embed = new MessageEmbed()
                .setTitle("channel")
                .setDescription("✅ **" + count + "** channels deleted")
                .setColor(color)
                .setFooter(message.member.user.tag + " | bot.tekoh.wtf")
            return message.channel.send(embed)
        }

        if (args[0] == "rename" || args[0] == "r") {
            if (!args.length >= 3) {
                return message.channel.send("❌\n$channel **r**ename <channel> <name>")
            }
            const channel = message.mentions.channels.first()

            if (!channel) {
                return message.channel.send("❌\ninvalid channel")
            }

            args.shift()
            args.shift()

            const name = args.join("-")

            await channel.edit({name: name}).then(() => {
            }).catch(() => {
                return message.channel.send("❌\nthere was an error. possibly invalid characters")
            })
            const embed = new MessageEmbed()
                .setTitle("channel")
                .setDescription("✅ channel renamed to " + name)
                .setColor(color)
                .setFooter(message.member.user.tag + " | bot.tekoh.wtf")
            return message.channel.send(embed)
        }

        if (args[0] == "nsfw") {
            if (args.length != 2) {
                return message.channel.send("❌\n$channel nsfw <channel>")
            }

            const channel = message.mentions.channels.first()

            if (!channel) {
                return message.channel.send("❌\ninvalid channel")
            }

            if (!channel.nsfw) {
                await channel.edit({nsfw: true})
                const embed = new MessageEmbed()
                    .setTitle("channel")
                    .setDescription(channel.name + "\n\n✅ channel is now nsfw")
                    .setColor(color)
                    .setFooter(message.member.user.tag + " | bot.tekoh.wtf")
                return message.channel.send(embed)
            } else {
                await channel.edit({nsfw: false})
                const embed = new MessageEmbed()
                    .setTitle("channel")
                    .setDescription(channel + "\n\n✅ channel is no longer nsfw")
                    .setColor(color)
                    .setFooter(message.member.user.tag + " | bot.tekoh.wtf")
                return message.channel.send(embed)
            }
        }

        return message.channel.send("❌\n$channel <**c**reate/**del**ete/**r**ename/nsfw> <channel> (name)")
    }
}