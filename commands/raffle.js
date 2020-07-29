const { MessageEmbed, MessageAttachment } = require("discord.js")
const { getColor } = require("../utils/utils")

const cooldown = new Map()

module.exports = {
    name: "raffle",
    description: "select a random user from current online members or a specific role",
    category: "fun",
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

        let members = []

        if (args.length == 0) {
            cooldown.set(message.member.id, new Date());

            setTimeout(() => {
                cooldown.delete(message.member.id);
            }, 3000);

            const members1 = message.guild.members.cache

            members1.forEach(m => {
                if (!m.user.bot && m.presence.status != "offline") {
                    if (members.indexOf(m.user.id) == -1) {
                        members.push(m.user.id)
                    }
                }
            })
        } else {
            const role = message.guild.roles.cache.find(r => r.name.toLowerCase().includes(args.join(" ")))

            if (!role) {
                return await message.channel.send("❌ i wasn't able to find that role")
            }

            cooldown.set(message.member.id, new Date());

            setTimeout(() => {
                cooldown.delete(message.member.id);
            }, 3000);

            role.members.forEach(m => {
                members.push(m.user.id)
            })

            if (members.length == 0) {
                return message.channel.send("❌ there is nobody in that role")
            }
        }

        let chosen = members[Math.floor(Math.random() * members.length)]

        chosen = await message.guild.members.fetch(chosen)

        color = getColor(chosen)

        const embed = new MessageEmbed()
            .setTitle("raffle by " + message.member.user.tag)
            .setColor(color)
            .setDescription("**" + chosen.user.tag + "**")
            .setFooter("bot.tekoh.wtf")

        return message.channel.send(embed)
    }
}