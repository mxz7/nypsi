const { MessageEmbed } = require("discord.js")
const { getMember, getColor } = require("../utils")

const cooldown = new Map()

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
            return message.channel.send("❌ still on cooldown for " + remaining );
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 3000);

        let size = Math.floor(Math.random() * 15)
        let sizeMsg = "8"

        const bigInch = Math.floor(Math.random() * 40)

        if (bigInch == 7) {
            size = Math.floor(Math.random() * 30) + 15
        }

        for (let i = 0; i < size; i++) {
            sizeMsg = sizeMsg + "="
        }
        sizeMsg = sizeMsg + "D"

        const color = getColor(message.member);

        if (args.length == 0) {
            const embed = new MessageEmbed()
                .setColor(color)
                .setTitle("pp predictor 1337")
                .setDescription(message.member.user.toString() + "\n" + sizeMsg + "\n📏 " + size + " inches")

                .setFooter("bot.tekoh.wtf")
        
            return message.channel.send(embed).catch(() => {
                return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
            });
        } else {
            let member

            if (!message.mentions.members.first()) {
                member = getMember(message, args[0])
            } else {
                member = message.mentions.members.first()
            }

            if (!member) {
                const embed = new MessageEmbed()
                .setColor(color)
                .setTitle("pp predictor 5000")
                .setDescription(message.member.user.toString() + "\n" + sizeMsg + "\n📏 " + size + " inches")

                .setFooter("bot.tekoh.wtf")
        
                return message.channel.send(embed).catch(() => {
                return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
                });
            }

            const embed = new MessageEmbed()
                .setColor(color)
                .setTitle("pp predictor 5000")
                .setDescription(member.user.toString() + "\n" + sizeMsg + "\n📏 " + size + " inches")

                .setFooter("bot.tekoh.wtf")
        
            message.channel.send(embed).catch(() => {
                return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
            });
        }
    }  
}