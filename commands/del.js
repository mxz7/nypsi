/*jshint esversion: 8 */

var cooldown = new Map();

module.exports = {
    name: "del",
    description: "bulk delete/purge messages",
    category: "moderation",
    run: async (message, args) => {

        if (!message.member.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send("❌ \nyou are lacking permission: 'MANAGE_MESSAGES'");  
        } 

        if (!message.guild.me.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send("❌ \ni am lacking permission: 'MANAGE_MESSAGES'");
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
            return message.channel.send("❌\nstill on cooldown for " + remaining);
        }

        if (isNaN(args[0]) || parseInt(args[0]) <= 0) {
            return message.channel.send("❌\n$del <amount>");
        }

        let amount = parseInt(args[0])

        if (!message.member.hasPermission("ADMINISTRATOR")) {
            if (amount > 15) {
                amount = 15
            }
            cooldown.set(message.member.id, new Date());

            setTimeout(() => {
                cooldown.delete(message.member.id);
            }, 30000);
        }

        await message.delete()
        
        if (amount <= 100) {
            await message.channel.bulkDelete(amount).then(m => {
                return message.channel.send("✅\n**successfully deleted " + m.size + " messages**").then(m => m.delete(10000));
            }).catch(() => {
                message.channel.send("❌\nunable to delete " + amount + " messages").then(m => m.delete(10000))
                return
            })
        } else {
            const amount1 = amount
            let fail = false
            if (amount > 10000) {
                amount = 10000
            }

            for (let i = 0; i < (amount1 / 100); i++) {
                if (amount <= 100) {
                    await message.channel.bulkDelete(amount).then(m => {
                        return message.channel.send("✅\n**successfully deleted " + amount1 + " messages**").then(m => m.delete(10000));
                    }).catch(() => {
                        message.channel.send("❌\nunable to delete " + amount + " messages").then(m => m.delete(10000))
                        fail = true
                    })
                }

                await message.channel.bulkDelete(100).catch(() => {
                    message.channel.send("❌\nunable to delete " + amount + " messages").then(m => m.delete(10000))
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