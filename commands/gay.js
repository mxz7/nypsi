const { MessageEmbed, Message } = require("discord.js");
const {  getMember, getColor } = require("../utils/utils")

const cache = new Map()
const cooldown = new Map()

module.exports = {
    name: "gay",
    description: "gay calculator",
    category: "fun",
    aliases: ["howgay"],
    /**
     * @param {Message} message 
     * @param {Array} args 
     */
    run: async (message, args) => {

        let color = getColor(message.member)

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
            cooldown.delete(message.member.id);
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
                return message.channel.send("❌ invalid user");
            }
        }

        let gayAmount

        if (cache.has(member.user.id)) {
            gayAmount = cache.get(member.user.id)
        } else {
            gayAmount = Math.ceil(Math.random() * 101) - 1

            cache.set(member.user.id, gayAmount)

            setTimeout(() => {
                cache.delete(member.user.id)
            }, 60000);
        }
        
        let gayText = ""
        let gayEmoji = ""

        if (gayAmount >= 70) {
            gayEmoji = ":rainbow_flag:"
            gayText = "dam hmu 😏"
        } else if (gayAmount >= 45) {
            gayEmoji = "🌈"
            gayText = "good enough 😉"
        } else if (gayAmount >= 20) {
            gayEmoji = "👫"
            gayText = "kinda straight 😐"
        } else {
            gayEmoji = "📏"
            gayText = "thought we coulda had smth 🙄"
        }

        

        color = getColor(member);

        const embed = new MessageEmbed()
            .setTitle("gay calculator")
            .setColor(color)
            .setFooter("bot.tekoh.wtf")
            .setDescription(member.user.toString() + "\n" + "**" + gayAmount + "**% gay " + gayEmoji + "\n" + gayText)

        return await message.channel.send(embed)
    }
}