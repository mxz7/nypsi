const { MessageEmbed } = require("discord.js")
const { getMember, getColor } = require("../utils/utils")

const cache = new Map()
const cooldown = new Map()

module.exports = {
    name: "pp",
    description: "accurate prediction of your pp size",
    category: "fun",
    aliases: ["penis"],
    run: async (message, args) => {

        let color = getColor(message.member);

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
            return message.channel.send(new MessageEmbed().setDescription("❌ still on cooldown for " + remaining).setColor(color));
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.author.id);
        }, 3000);

        let member

        if (args.length == 0) {
            member = message.member
        } else {
            if (!message.mentions.members.first()) {
                member = getMember(message, args[0])
            } else {
                member = message.mentions.members.first()
            }

            if (!member) {
                member = message.member
            }
        }

        let size
        let sizeMsg = "8"

        if (cache.has(member.user.id)) {
            size = cache.get(member.user.id)
        } else {
            size = Math.floor(Math.random() * 15)
    
            const bigInch = Math.floor(Math.random() * 40)
    
            if (bigInch == 7) {
                size = Math.floor(Math.random() * 30) + 15
            }
            cache.set(member.user.id, size)

            setTimeout(() => {
                cache.delete(member.user.id)
            }, 120000)
        }

        for (let i = 0; i < size; i++) {
            sizeMsg = sizeMsg + "="
        }
        
        sizeMsg = sizeMsg + "D"

        color = getColor(member);

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle("pp predictor 1337")
            .setDescription(member.user.toString() + "\n" + sizeMsg + "\n📏 " + size + " inches")

            .setFooter("bot.tekoh.wtf")
        
        return message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });
    }  
}