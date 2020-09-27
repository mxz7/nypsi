const { MessageEmbed, Message } = require("discord.js");;
const fetch = require("node-fetch");
const { getColor } = require("../utils/utils")

const cooldown = new Map();

module.exports = {
    name: "instagram",
    description: "view stats for an instagram account",
    category: "info",
    aliases: ["ig"],
    /**
     * @param {Message} message 
     * @param {Array<String>} args 
     */
    run: async (message, args) => {

        if (!message.guild.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ i am lacking permission: 'EMBED_LINKS'");
        }

        const color = getColor(message.member);

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
            return message.channel.send(new MessageEmbed().setDescription("❌ still on cooldown for " + remaining).setColor(color));
        }
        
        if (args.length == 0) {
            return message.channel.send("❌ $insagram <account>");
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
            console.log(e)
            return await message.channel.send("sorry. this command is currently unavailable due to a change with how instagram handles requests")
        }
        
        let account

        try {
            account = res.graphql.user;
        } catch {
            return message.channel.send("❌ invalid account"); 
        }

        let title;

        if (account.is_private) {
            title = (account.username + " 🔒");
        } else if (account.is_verified) {
            title = (account.username + " :white_check_mark:");
        } else {
            title = account.username;
        }

        let text = `**name** ${account.full_name}`

        if (account.biography.length != 0) {
            text = text + `\n**bio** ${account.biography}`
        }

        if (account.external_url != null) {
            text = text + `\n**link** ${account.external_url}`
        }

        text = text + `\n**followers** ${account.edge_followed_by.count.toLocaleString()}\n**following** ${account.edge_follow.count.toLocaleString()}`

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle(title)
            .setURL(`https://instagram.com/${name}`)
            .setThumbnail(account.profile_pic_url_hd)
            .setDescription(text)
            .setFooter("bot.tekoh.wtf")

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });
    }
};