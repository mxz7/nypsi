/*jshint esversion: 8 */
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const fetch = require("node-fetch");

var cooldown = new Map();

module.exports = {
    name: "instagram",
    description: "view stats for an instagram account",
    category: "info",
    run: async (message, args) => {

        if (!message.guild.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ \ni am lacking permission: 'EMBED_LINKS'");
        }

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 10 - diff

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
        
        if (args.length == 0) {
            return message.channel.send("❌\ninvalid account");
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 10000);

        const name = args[0];

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

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle(title)
            .setURL(`https://instagram.com/${name}`)
            .setThumbnail(account.profile_pic_url_hd)
            .addField("profile", stripIndents`**name** ${account.full_name}
            **bio** ${account.biography.length == 0 ? "none" : account.biography}
            **link** ${account.external_url == null ? "none" : account.external_url}
            **followers** ${account.edge_followed_by.count.toLocaleString()}
            **following** ${account.edge_follow.count.toLocaleString()}
            **posts** ${account.edge_owner_to_timeline_media.count.toLocaleString()}`)
            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });
    }
};