/*jshint esversion: 8 */
const { RichEmbed } = require("discord.js");
const { list } = require("../facts.json");

var cooldown = new Set();

module.exports = {
    name: "fact",
    description: "get a random fact",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            message.delete().catch();
            return message.channel.send("❌\nstill on cooldown").then(m => m.delete(1000));
        }

        cooldown.add(message.member.id);

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 4000);
        
        const fact = list[Math.floor(Math.random() * list.length)];

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new RichEmbed()
            .setColor(color)
            .setTitle("fact")
            .setDescription(fact)
            .setThumbnail(message.member.user.avatarURL)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });

    }
};