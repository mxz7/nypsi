/*jshint esversion: 8 */
const { RichEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");

const fetch = require("node-fetch");

var cooldown = new Set();

module.exports = {
    name: "instagram",
    category: "info",
    description: "find instagram info about an account",
    run: async (message, args) => {

        if (!message.guild.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ \ni am lacking permission: 'EMBED_LINKS'");
        }

        if (cooldown.has(message.member.id)) {
            return message.channel.send("❌\nstill on cooldown");
        }

        if (args.length == 1) {
            return message.channel.send("❌\ninvalid account");
        }

        cooldown.add(message.member.id);

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 2000);

        const name = args[1];

        const url = `https://instagram.com/${name}/?__a=1`;
        
        let res; 

        try {
            res = await fetch(url).then(url => url.json());
        } catch (e) {
            return message.channel.send("❌\ninvalid account");
        }

        const account = res.graphql.user;
        let title;

        if (account.is_private) {
            title = (account.username + " 🔒");
        } else if (account.is_verified) {
            title = (account.username + " :white_check_mark:");
        } else {
            title = account.username;
        }

        const embed = new RichEmbed()
            .setColor("#FC4040")
            .setTitle(title)
            .setURL(`https://instagram.com/${name}`)
            .setThumbnail(account.profile_pic_url_hd)
            .addField("profile", stripIndents`**name:** ${account.full_name}
            **bio:** ${account.biography.length == 0 ? "none" : account.biography}
            **link:** ${account.external_url == null ? "none" : account.external_url}
            **followers:** ${account.edge_followed_by.count.toLocaleString()}
            **following:** ${account.edge_follow.count.toLocaleString()}
            **posts:** ${account.edge_owner_to_timeline_media.count.toLocaleString()}`)
            .setFooter(message.member.user.tag, message.member.user.avatarURL)
            .setTimestamp();

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });
    }
};