/*jshint esversion: 8 */
const { MessageEmbed } = require("discord.js");;
const { formatDate } = require("../utils.js");

module.exports = {
    name: "server",
    description: "view information about current server",
    category: "info",
    run: async (message, args) => {

        const server = message.guild;

        if (!server.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ \ni am lacking permission: 'EMBED_LINKS'");
        }

        const created = formatDate(server.createdAt).toLowerCase();
        const members = server.members.cache
        const users = members.filter(member => !member.user.bot)
        const bots = members.filter(member => member.user.bot)
        const online = users.filter(member => member.presence.status != "offline")

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new MessageEmbed()
            .setThumbnail(server.iconURL())
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
                "**online** " + online.size.toLocaleString())

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")

        message.channel.send(embed).catch(() => {
             return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });
    }
};