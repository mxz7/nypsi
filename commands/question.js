/*jshint esversion: 8 */

const { RichEmbed } = require("discord.js");

var cooldown = new Set();

module.exports = {
    name: "question",
    description: "create a question",
    run: async (message, args) => {

        if (!message.member.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send("❌ \nyou are lacking permission: 'MANAGE_MESSAGES'");  
        } 

        if (args.length == 0) {
            return message.channel.send("❌\n$question <channel> <title> | <text>");
        }

        if (!message.content.includes("|")) {
            return message.channel.send("❌\n$poll <channel> <title> | <text>");
        }

        if (!message.member.hasPermission("ADMINISTRATOR")) {
            cooldown.add(message.member.id);
            setTimeout(() => {
                cooldown.delete(message.member.id);
            }, 60000);
        } else {
            cooldown.add(message.member.id);
            setTimeout(() => {
                cooldown.delete(message.member.id);
            }, 30000);
        }

        let channel = message.mentions.channels.first();

        if (!channel) {
            return message.channel.send("❌\ninvalid channel");
        }

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        args.shift();

        const newArgs = args.join(" ").split("|");

        const title = newArgs[0];

        const description = newArgs[1];

        const embed = new RichEmbed()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();

        
        channel.send(embed).then( m => {
            m.react("👍").then( () => {
                m.react("👎");
            });
            if (message.channel.id != channel.id) {
                message.channel.send("✅\n**success**");
            }
        }).catch( () => {
            message.channel.send("❌\ni dont have permission to send messages there");
        });

    }
};