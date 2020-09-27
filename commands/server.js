const { MessageEmbed, Message } = require("discord.js");;;
const { formatDate, getColor } = require("../utils/utils");
const { getPeaks, inCooldown, addCooldown } = require("../guilds/utils.js")

module.exports = {
    name: "server",
    description: "view information about current server",
    category: "info",
    aliases: ["serverinfo"],
    /**
     * @param {Message} message 
     * @param {Array<String>} args 
     */
    run: async (message, args) => {

        const server = message.guild;

        if (!server.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ i am lacking permission: 'EMBED_LINKS'");
        }

        const created = formatDate(server.createdAt).toLowerCase();

        let members 

        if (inCooldown(server) || message.guild.memberCount == message.guild.members.cache.size || message.guild.memberCount <= 250) {
            members = server.members.cache
        } else {
            members = await server.members.fetch()

            addCooldown(server, 3600)
        }

        const users = members.filter(member => !member.user.bot)
        const bots = members.filter(member => member.user.bot)
        const online = users.filter(member => member.presence.status != "offline")
        
        const color = getColor(message.member);

        if (args.length == 1 && args[0] == "-id") {
            const embed = new MessageEmbed()
                .setTitle(server.name)
                .setColor(color)
                .setDescription("`" + server.id + "`")
                .setFooter("bot.tekoh.wtf")
            
            return message.channel.send(embed).catch(() => {
                return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
            });
        }
           
        if (args.length == 1 && args[0] == "-m") {
            const embed = new MessageEmbed()
                .setThumbnail(server.iconURL({format: "png", dynamic: true, size: 128}))
                .setColor(color)
                .setTitle(server.name)

                .addField("member info", "**humans** " + users.size.toLocaleString() + "\n" +
                    "**bots** " + bots.size.toLocaleString() + "\n" + 
                    "**online** " + online.size.toLocaleString() + "\n" +
                    "**member peak** " + getPeaks(message.guild).members.toLocaleString() + "\n" + 
                    "**online peak** " + getPeaks(message.guild).onlines.toLocaleString())

                .setFooter("bot.tekoh.wtf")

            return message.channel.send(embed).catch(() => {
                return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
            });
        }

        const embed = new MessageEmbed()
            .setThumbnail(server.iconURL({format: "png", dynamic: true, size: 128}))
            .setColor(color)
            .setTitle(server.name)
            
            .addField("info", "**owner** " + server.owner.user.tag + "\n" +
                "**created** " + created + "\n" +
                "**region** " + server.region, true)

            .addField("info", "**roles** " + server.roles.cache.size + "\n" + 
                "**channels** " + server.channels.cache.size + "\n" +
                "**id** " + server.id, true)

            .addField("member info", "**humans** " + users.size.toLocaleString() + "\n" +
                "**bots** " + bots.size.toLocaleString() + "\n" + 
                "**online** " + online.size.toLocaleString() + "\n" +
                "**member peak** " + getPeaks(message.guild).members.toLocaleString() + "\n" + 
                "**online peak** " + getPeaks(message.guild).onlines.toLocaleString())

            .setFooter("bot.tekoh.wtf")

        if (server.memberCount >= 25000) {
            embed.setFooter(`real member count: ${server.memberCount} | stats are inaccurate to optimise with large servers`)
        }

        message.channel.send(embed).catch(() => {
             return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });
    }
};