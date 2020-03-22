const { RichEmbed } = require("discord.js")
const { getMember } = require("../utils")

var cooldown = new Map()

module.exports = {
    name: "pp",
    description: "accurate prediction of your pp size",
    category: "fun",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 3 - diff

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

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 3000);

        let size = Math.floor(Math.random() * 20)
        let sizeMsg = "8"

        for (let i = 0; i < size; i++) {
            sizeMsg = sizeMsg + "="
        }
        sizeMsg = sizeMsg + "D"

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        if (args.length == 0) {
            const embed = new RichEmbed()
                .setColor(color)
                .setTitle("pp predictor 1337")
                .setDescription(message.member + "\n" + sizeMsg + "\n📏 " + size + " inches")

                .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
                .setTimestamp();
        
            return message.channel.send(embed).catch(() => {
                return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
            });
        } else {
            let member

            if (!message.mentions.members.first()) {
                member = getMember(message, args[0])
            } else {
                member = message.mentions.members.first()
            }

            if (!member) {
                const embed = new RichEmbed()
                .setColor(color)
                .setTitle("pp predictor 5000")
                .setDescription(message.member + "\n" + sizeMsg + "\n📏 " + size + " inches")

                .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
                .setTimestamp();
        
                return message.channel.send(embed).catch(() => {
                return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
                });
            }

            const embed = new RichEmbed()
                .setColor(color)
                .setTitle("pp predictor 5000")
                .setDescription(member + "\n" + sizeMsg + "\n📏 " + size + " inches")

                .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
                .setTimestamp();
        
            message.channel.send(embed).catch(() => {
                return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
            });
        }
    }  
}