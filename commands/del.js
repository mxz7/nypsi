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
            await message.channel.bulkDelete(amount).catch(() => {
                return message.channel.send("❌ unable to delete " + amount + " messages").then(m => m.delete({timeout: 5000}))
            })
        } else {
            const amount1 = amount
            let fail = false
            let counter = 0
            if (amount > 10000) {
                amount = 10000
            }

            for (let i = 0; i < (amount1 / 100); i++) {
                if (amount <= 100) {
                    await message.channel.bulkDelete(amount).catch(() => {
                        message.channel.send("❌ unable to delete " + amount + " messages").then(m => m.delete({timeout: 5000}))
                        fail = true
                    })
                    break
                }

                if (counter >= 3) {
                    const m = await message.channel.messages.fetch({limit: 100})
                    return await message.channel.bulkDelete(m)
                } else {
                    counter++
                }

                await message.channel.bulkDelete(100).catch(() => {
                    message.channel.send("❌ unable to delete " + amount + " messages").then(m => m.delete({timeout: 5000}))
                    fail = true
                })
                if (fail) {
                    break
                }
                amount = amount - 100
            }
        }

    }
}