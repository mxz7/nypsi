const { MessageEmbed } = require("discord.js")
const {  getMember, getColor } = require("../utils/utils")

const cooldown = new Map()

module.exports = {
    name: "gay",
    description: "gay calculator",
    category: "fun",
    aliases: ["howgay"],
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


        const gayAmount = Math.ceil(Math.random() * 101) - 1
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

        let color = getColor(member);

        const embed = new MessageEmbed()
            .setTitle("gay calculator")
            .setColor(color)
            .setFooter("bot.tekoh.wtf")
            .setDescription(member.user.toString() + "\n" + "**" + gayAmount + "**% gay " + gayEmoji + "\n" + gayText)

        return await message.channel.send(embed)
    }
}