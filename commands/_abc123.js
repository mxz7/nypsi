const { MessageEmbed } = require("discord.js")
const { formatDate } = require("../utils.js")
const { getPeaks } = require("../guilds/utils.js")
const { getBalance, userExists, getVoteMulti, topAmount, topAmountGlobal, getBankBalance, getMaxBankBalance, getXp } = require("../economy/utils.js")

module.exports = {
    name: "_abc123",
    description: "classified",
    category: "none",
    run: async (message, args) => {
        if (message.member.user.id != "672793821850894347") return

        if (args.length == 0) return

        if (args[0] == "id") {
            if (args.length == 1) return
            
            const users = message.client.users.cache
            const guilds = message.client.guilds.cache

            let user = users.find(u => u.id == args[1])
            if (!user) {
                return message.react("❌")
            }

            let guildNames = ""

            guilds.forEach(g => {
                const abc = g.members.cache.find(u => u.id == args[1])

                if (abc) {
                    guildNames = guildNames + "`" + g.id + "` "
                    user = abc
                }
            })

            const embed = new MessageEmbed()
                .setTitle(user.user.tag)
                .setColor("#60d16b")
                .setDescription("`" + user.id + "`")
                .setThumbnail(user.user.avatarURL({ format: "png", dynamic: true, size: 128 }))
                .addField("user info", "**tag** " + user.user.tag + "\n" +
                    "**created** " + formatDate(user.user.createdAt), true)
                .setFooter("bot.tekoh.wtf")

            if (userExists(user)) {
                let voted = false
                if (await getVoteMulti(user) > 0) voted = true
                embed.addField("economy", "💰 $**" + getBalance(user).toLocaleString() + "**\n" +
                    "💳 $**" + getBankBalance(user).toLocaleString() + "** / **" + getMaxBankBalance(user).toLocaleString() + "**\n" +
                    "**xp** " + getXp(user) + "\n" +
                    "**voted** " + voted, true)
            }
            
            embed.addField("guilds", guildNames)
            
            message.channel.send(embed)
        } else if (args[0] == "tag") {
            if (args.length == 1) return

            const users = message.client.users.cache
            const guilds = message.client.guilds.cache

            let user = users.find(u => (u.username + "#" + u.discriminator).toLowerCase().includes(args[1]))

            if (!user) {
                return message.react("❌")
            }

            let guildNames = ""

            guilds.forEach(g => {
                const abc = g.members.cache.find(u => u.user.tag.toLowerCase().includes(args[1]))

                if (abc) {
                    guildNames = guildNames + "`" + g.id + "` "
                    user = abc
                }
            })

            const embed = new MessageEmbed()
                .setTitle(user.user.tag)
                .setColor("#60d16b")
                .setDescription("`" + user.id + "`")
                .setThumbnail(user.user.avatarURL({ format: "png", dynamic: true, size: 128 }))
                .addField("user info", "**tag** " + user.user.tag + "\n" +
                    "**created** " + formatDate(user.user.createdAt), true)
                .setFooter("bot.tekoh.wtf")

            if (userExists(user)) {
                let voted = false
                if (await getVoteMulti(user) > 0) voted = true
                embed.addField("economy", "💰 $**" + getBalance(user).toLocaleString() + "**\n" +
                    "💳 $**" + getBankBalance(user).toLocaleString() + "** / **" + getMaxBankBalance(user).toLocaleString() + "**\n" +
                    "**xp** " + getXp(user) + "\n" +
                    "**voted** " + voted, true)
            }
            
            embed.addField("guilds", guildNames)
            
            message.channel.send(embed)
        } else if (args[0] == "gid") {
            if (args.length == 1) return

            const guild = message.client.guilds.cache.find(g => g.id == args[1])

            if (!guild) {
                return message.react("❌")
            }

            const members = guild.members.cache
            const users = members.filter(member => !member.user.bot)
            const bots = members.filter(member => member.user.bot)
            const online = users.filter(member => member.presence.status != "offline")

            const balTop = topAmount(guild, 5)

            const filtered = balTop.filter(function (el) {
                return el != null;
            });

            let owner

            try {
                owner = guild.owner.user.tag
            } catch (e) {
                owner = "`" + guild.ownerID + "`"
            }

            const embed = new MessageEmbed()
                .setTitle(guild.name)
                .setColor("#60d16b")
                .setThumbnail(guild.iconURL({format: "png", dynamic: true, size: 128}))
                .setDescription("`" + guild.id + "`")
                .addField("info", "**owner** " + owner + "\n" + 
                    "**created** " + formatDate(guild.createdAt) + "\n" +
                    "**region** " + guild.region, true)
                .addField("info", "**roles** " + guild.roles.cache.size + "\n" + 
                    "**channels** " + guild.channels.cache.size, true)
                .addField("member info", "**humans** " + users.size.toLocaleString() + "\n" +
                    "**bots** " + bots.size.toLocaleString() + "\n" + 
                    "**online** " + online.size.toLocaleString() + "\n" +
                    "**member peak** " + getPeaks(guild).members.toLocaleString() + "\n" + 
                    "**online peak** " + getPeaks(guild).onlines.toLocaleString(), true)
                .addField("top " + filtered.length, filtered)
                .setFooter("bot.tekoh.wtf")
            message.channel.send(embed)
        } else if (args[0] == "gname") {
            if (args.length == 1) return

            const guild = message.client.guilds.cache.find(g => g.name.toLowerCase().includes(args[1]))

            if (!guild) {
                return message.react("❌")
            }

            const members = guild.members.cache
            const users = members.filter(member => !member.user.bot)
            const bots = members.filter(member => member.user.bot)
            const online = users.filter(member => member.presence.status != "offline")

            const balTop = topAmount(guild, 5)

            const filtered = balTop.filter(function (el) {
                return el != null;
            });

            let owner

            try {
                owner = guild.owner.user.tag
            } catch (e) {
                owner = "`" + guild.ownerID + "`"
            }

            const embed = new MessageEmbed()
                .setTitle(guild.name)
                .setColor("#60d16b")
                .setThumbnail(guild.iconURL({format: "png", dynamic: true, size: 128}))
                .setDescription("`" + guild.id + "`")
                .addField("info", "**owner** " + owner + "\n" + 
                    "**created** " + formatDate(guild.createdAt) + "\n" +
                    "**region** " + guild.region, true)
                .addField("info", "**roles** " + guild.roles.cache.size + "\n" + 
                    "**channels** " + guild.channels.cache.size, true)
                .addField("member info", "**humans** " + users.size.toLocaleString() + "\n" +
                    "**bots** " + bots.size.toLocaleString() + "\n" + 
                    "**online** " + online.size.toLocaleString() + "\n" +
                    "**member peak** " + getPeaks(guild).members.toLocaleString() + "\n" + 
                    "**online peak** " + getPeaks(guild).onlines.toLocaleString(), true)
                .addField("top " + filtered.length, filtered)
                .setFooter("bot.tekoh.wtf")
            message.channel.send(embed)
        } else if (args[0] == "top") {

            let amount = 5

            if (args.length > 1 && parseInt(args[1])) {
                amount = parseInt(args[1])
            }

            const balTop = topAmountGlobal(amount)

            const filtered = balTop.filter(function (el) {
                return el != null;
            });

            const embed = new MessageEmbed()
                .setTitle("top " + filtered.length)
                .setColor("#60d16b")
                .setDescription(filtered)
                .setFooter("bot.tekoh.wtf")

            message.channel.send(embed)
        }
    }
}