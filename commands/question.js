/*jshint esversion: 8 */

const { MessageEmbed } = require("discord.js");

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
            return message.channel.send("❌\n$question <text> | (hex color)");
        }

        cooldown.set(message.member.id, new Date());
        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 10000);

        const question = args.join(" ").split("|")[0]
        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        if (args.join(" ").includes("|")) {
            color = args.join(" ").split("|")[1]
        }

        const embed = new MessageEmbed()
            .setTitle(question)
            .setColor(color)
            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")

        
        message.channel.send(embed).then(async m => {
            message.delete()
            await m.react("✅")
            await m.react("❌");
        })

    }
};