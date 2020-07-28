const { MessageEmbed } = require("discord.js")
const { getColor } = require("../utils/utils")
const { list } = require("../optout.json");

const cooldown = new Map();

module.exports = {
    name: "rickroll",
    description: "rickroll your friends",
    category: "fun",
    run: async (message, args) => {
        
        const color = getColor(message.member);

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 15 - diff

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

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 15000);

        if (args.length == 0) {
            return message.channel.send("❌ you must tag a user for this command");
        }

        let target;

        target = message.mentions.members.first();

        if (!target) {
            return message.channel.send("❌ invalid user - you must tag the user for this command");
        }

        if (list.includes(message.member.user.id)) {
            return message.channel.send("❌ you have opted out of bot dms, use $optin to be able to use this command");
        }

        if (list.includes(target.user.id)) {
            return message.channel.send("❌ this user has opted out of bot dms");
        }

        target.send("**sent by " + message.member.user.tag + " in " + message.guild.name + "** use $optout to optout" + " https://youtu.be/dQw4w9WgXcQ").then( () => {
            message.channel.send("✅ success");
        }).catch( () => {
            return message.channel.send("❌ i cannot message that user");
        });

    }
};