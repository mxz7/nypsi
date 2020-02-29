/*jshint esversion: 8 */
const { RichEmbed } = require("discord.js");
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

        const created = formatDate(server.createdAt);

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new RichEmbed()
            .setThumbnail(server.iconURL)
            .setColor(color)
            .setTitle(server.name)
            
            .addField("server info", stripIndents `**owner** ${server.owner.user.tag}
            **created** ${created}
            **region** ${server.region}
            **channels** ${server.channels.size}
            **roles** ${server.roles.size}
            **members** ${server.memberCount}
            **id** ${server.id}`)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();

        message.channel.send(embed).catch(() => {
             return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });
    }
};