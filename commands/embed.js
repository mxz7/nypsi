const { RichEmbed } = require("discord.js");

var cooldown = new Map();

module.exports = {
    name: "embed",
    description: "create an embed message",
    category: "info",
    run: async (message, args) => {

        if (!message.member.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send("❌ \nyou are lacking permission: 'MANAGE_MESSAGES'");  
        } 

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 25 - diff

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
            return message.channel.send("❌\n$embed <channel> <title> | <text>");
        }

        if (!message.content.includes("|")) {
            return message.channel.send("❌\n$embed <channel> <title> | <text>");
        }

        cooldown.set(message.member.id, new Date());
        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 25000);

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

        
        channel.send(embed).then(() => {
            if (message.channel.id != channel.id) {
                message.channel.send("✅\n**success**");
            }
        }).catch( () => {
            message.channel.send("❌\ni dont have permission to send messages there");
        });

    }
};