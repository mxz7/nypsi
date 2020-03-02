/*jshint esversion: 8 */
const { RichEmbed } = require("discord.js");
const { wholesomeImg } = require("../utils.js");
const { wholesome } = require("../lists.json")

var cooldown = new Set();

module.exports = {
    name: "wholesome",
    description: "get a random wholesome picture",
    category: "fun",
    run: async (message, args) => {

        if (!message.guild.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ \ni am lacking permission: 'EMBED_LINKS'");
        }

        if (cooldown.has(message.member.id)) {
            message.delete().catch();
            return message.channel.send("❌\nstill on cooldown").then(m => m.delete(1000));
        }

        cooldown.add(message.member.id);

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 4000);

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new RichEmbed()
            .setColor(color)
            .setTitle("<3")
            .setImage(wholesome[Math.floor(Math.random() * wholesome.length)])

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });

    }
};