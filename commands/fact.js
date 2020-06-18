const { MessageEmbed } = require("discord.js");
const { facts } = require("../lists.json");
const { getColor } = require("../utils/utils")

const cooldown = new Map();

module.exports = {
    name: "fact",
    description: "get a random fact",
    category: "fun",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 5 - diff

            const minutes = Math.floor(time / 60)
            const seconds = time - minutes * 60

            let remaining

            if (minutes != 0) {
                remaining = `${minutes}m${seconds}s`
            } else {
                remaining = `${seconds}s`
            }
            return message.channel.send("❌ still on cooldown for " + remaining );
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);
        
        const fact = facts[Math.floor(Math.random() * facts.length)];

        const color = getColor(message.member);

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle("fact | " + message.member.user.username)
            .setDescription(fact)

            .setFooter("bot.tekoh.wtf")
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });

    }
};