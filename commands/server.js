/*jshint esversion: 8 */
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
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

        const onlineCount = server.members.cache.filter(member => member.presence.status != "offline").size

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
            
            .addField("server info", stripIndents `**owner** ${server.owner.user.tag}
            **id** ${server.id}
            **created** ${created}
            **region** ${server.region}
            **channels** ${server.channels.cache.size}
            **roles** ${server.roles.cache.size}
            **members** ${server.memberCount}
            **online members** ${onlineCount}`)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")

        message.channel.send(embed).catch(() => {
             return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });
    }
};