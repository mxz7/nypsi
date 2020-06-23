const { MessageFlags } = require("discord.js");

const cooldown = new Map();

module.exports = {
    name: "del",
    description: "bulk delete/purge messages",
    category: "moderation",
    run: async (message, args) => {

        if (!message.member.hasPermission("MANAGE_MESSAGES")) {
            return
        } 

        if (!message.guild.me.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send("❌ i am lacking permission: 'MANAGE_MESSAGES'");
        }

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
            return message.channel.send("❌ still on cooldown for " + remaining);
        }

        if (isNaN(args[0]) || parseInt(args[0]) <= 0) {
            return message.channel.send("❌ $del <amount>");
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
        
        if (amount <= 100) {
            await message.channel.bulkDelete(amount, true).catch()
        } else {
            const amount1 = amount
            let fail = false
            if (amount > 10000) {
                amount = 10000
            }

            console.log("performing mass delete on " + amount + messages)
            for (let i = 0; i < (amount1 / 100); i++) {
                console.log("remaining: " + amount)

                if (amount < 10) return
                
                if (amount <= 100) {
                    let messages = await message.channel.messages.fetch({limit: amount})

                    messages = messages.filter(m => {
                        return timeSince(new Date(m.createdTimestamp)) < 14
                    })

                    return await message.channel.bulkDelete(messages).catch()
                }

                let messages = await message.channel.messages.fetch({limit: 100})

                messages = messages.filter(m => {
                    return timeSince(new Date(m.createdTimestamp)) < 14
                })

                if (messages.size < 100) amount = messages.size

                await message.channel.bulkDelete(messages).catch(() => {
                    fail = true
                })

                if (fail) {
                    return console.log("failed")
                }
                
                amount = amount - 100
            }
        }

    }
}

function timeSince(date) {

    const ms = Math.floor((new Date() - date));

    const days = Math.floor(ms / (24 * 60 * 60 * 1000))

    return days
}