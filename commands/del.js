const { MessageEmbed } = require("discord.js");
const { getColor } = require("../utils/utils")

const cooldown = new Map();

module.exports = {
    name: "del",
    description: "bulk delete/purge messages",
    category: "moderation",
    aliases: ["purge"],
    permissions: ["MANAGE_MESSAGES"],
    run: async (message, args) => {

        if (!message.member.hasPermission("MANAGE_MESSAGES")) {
            return
        } 

        if (!message.guild.me.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send("❌ i am lacking permission: 'MANAGE_MESSAGES'");
        }

        const color = getColor(message.member)

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 30 - diff

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

        if (isNaN(args[0]) || parseInt(args[0]) <= 0) {
            return message.channel.send("❌ $del <amount> (@user)");
        }

        let amount = parseInt(args[0]) + 1

        if (!message.member.hasPermission("ADMINISTRATOR")) {
            if (amount > 100) {
                amount = 100
            }
            cooldown.set(message.member.id, new Date());

            setTimeout(() => {
                cooldown.delete(message.member.id);
            }, 30000);
        }
        
        if (message.mentions.members.first()) {
            await message.delete()
            const target = message.mentions.members.first()

            const collected = await message.channel.messages.fetch({limit: 100})

            const collecteda = collected.filter(msg => {
                if (!msg.member) {
                } else {
                    return msg.member.user.id == target.user.id
                }
            })

            if (collecteda.size == 0) {
                return
            }
    
            let count = 0
    
            for (msg of collecteda.array()) {
                if (count >= amount) {
                    await collecteda.delete(msg.id)
                } else {
                    count++
                }
            }

            return await message.channel.bulkDelete(collecteda)
        }
        
        if (amount <= 100) {
            await message.channel.bulkDelete(amount, true).catch()
        } else {
            amount = amount - 1

            const amount1 = amount
            let fail = false
            let counter = 0

            if (amount > 10000) {
                amount = 10000
            }

            const embed = new MessageEmbed()
                .setTitle("delete | " + message.member.user.tag)
                .setDescription("deleting `" + amount + "` messages..\n - if you'd like to cancel this operation, delete this message")
                .setColor(color)
                .setFooter("bot.tekoh.wtf")

            const m = await message.channel.send(embed)
            for (let i = 0; i < (amount1 / 100); i++) {
                if (m.deleted) {
                    embed.setDescription("✅ operation cancelled")
                    return await message.channel.send(embed)
                }

                if (amount < 10) return await m.delete().catch()
                
                if (amount <= 100) {
                    let messages = await message.channel.messages.fetch({limit: amount, before: m.id})

                    messages = messages.filter(m => {
                        return timeSince(new Date(m.createdTimestamp)) < 14
                    })

                    await message.channel.bulkDelete(messages).catch()
                    return await m.delete().catch()
                }

                let messages = await message.channel.messages.fetch({limit: 100, before: m.id})

                messages = messages.filter(m => {
                    return timeSince(new Date(m.createdTimestamp)) < 14
                })

                if (messages.size < 100) {
                    amount = messages.size
                    counter = 0
                    embed.setDescription("deleting `" + amount + " / " + amount1 + "` messages..\n - if you'd like to cancel this operation, delete this message")
                    await m.edit(embed)
                }

                await message.channel.bulkDelete(messages).catch(() => {
                    fail = true
                })

                if (fail) {
                    return
                }
                
                amount = amount - 100
                counter++

                if (counter >= 2) {
                    counter = 0
                    embed.setDescription("deleting `" + amount + " / " + amount1 + "` messages..\n - if you'd like to cancel this operation, delete this message")
                    await m.edit(embed)
                }
            }
            return m.delete().catch()
        }

    }
}

function timeSince(date) {

    const ms = Math.floor((new Date() - date));

    const days = Math.floor(ms / (24 * 60 * 60 * 1000))

    return days
}