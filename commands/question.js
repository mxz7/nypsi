/*jshint esversion: 8 */

const { RichEmbed } = require("discord.js");

var cooldown = new Map();

module.exports = {
    name: "question",
    description: "create a question",
    category: "info",
    run: async (message, args) => {

        if (!message.member.hasPermission("MANAGE_MESSAGES")) {
            return 
        } 

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 60 - diff

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
            return message.channel.send("❌\n$question <title> | <text>");
        }

        if (!message.content.includes("|")) {
            return message.channel.send("❌\n$question <title> | <text>");
        }

        cooldown.set(message.member.id, new Date());
        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 60000);

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const title = args.join(" ").split("|")[0]

        const description = args.join(" ").split("|")[1]

        const embed = new RichEmbed()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();

        
        message.channel.send(embed).then( m => {
            m.react("👍").then( () => {
                m.react("👎");
            });
            message.delete()
        })

    }
};