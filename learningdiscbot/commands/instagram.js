/*jshint esversion: 8 */
const { RichEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");

const fetch = require("node-fetch");

var cooldown = false;

module.exports = {
    name: "instagram",
    aliases: ["insta"],
    category: "info",
    description: "Find out some nice instagram statistics",
    usage: "<name>",
    run: async (message, args) => {

        if (cooldown) {
            return message.reply("❌\nstill on cooldown");
        }

        if (args.length == 1) {
            return message.reply("❌\ninvalid account");
        }

        const name = args[1];

        const url = `https://instagram.com/${name}/?__a=1`;
        
        let res; 

        try {
            res = await fetch(url).then(url => url.json());
        } catch (e) {
            return message.reply("❌\ninvalid account");
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
            .addField("Profile information", stripIndents`**name:** ${account.full_name}
            **bio:** ${account.biography.length == 0 ? "none" : account.biography}
            **link:** ${account.external_url == null ? "none" : account.external_url}
            **followers:** ${account.edge_followed_by.count.toLocaleString()}
            **following:** ${account.edge_follow.count.toLocaleString()}
            **posts:** ${account.edge_owner_to_timeline_media.count.toLocaleString()}`)
            .setTimestamp();

        message.channel.send(embed);
        cooldown = true;
        setTimeout(finishCooldown, 2000);
    }
};

function finishCooldown() {
    cooldown = false;
}