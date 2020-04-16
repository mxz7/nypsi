const { MessageEmbed } = require("discord.js");;
const { formatDate, getColor } = require("../utils.js");
const { getPeaks } = require("../guilds/utils.js")

module.exports = {
    name: "server",
    description: "view information about current server",
    category: "info",
    run: async (message, args) => {

        const server = message.guild;

        if (!server.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ i am lacking permission: 'EMBED_LINKS'");
        }

        const created = formatDate(server.createdAt).toLowerCase();
        const members = server.members.cache
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

        message.channel.send(embed).catch(() => {
             return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });
    }
};