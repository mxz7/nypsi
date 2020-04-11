const cooldown = new Map()

module.exports = {
    name: "delp",
    description: "bulk delete/purge your own messages",
    category: "info",
    run: async (message, args) => {
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

        if (!message.guild.me.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send("❌ \ni am lacking permission: 'MANAGE_MESSAGES'");
        }

        if (args.length == 0) {
            args[0] = 7
        }

        if (isNaN(args[0]) || parseInt(args[0]) <= 0) {
            return message.channel.send("❌\n$delp <amount> (@user)");
        }

        let amount = parseInt(args[0])

        if (!message.member.hasPermission("ADMINISTRATOR")) {
            if (amount > 10) {
                amount = 10
            }
            cooldown.set(message.member.id, new Date());

            setTimeout(() => {
                cooldown.delete(message.member.id);
            }, 30000);
        }

        let target = message.member

        if (message.member.hasPermission("MANAGE_MESSAGES")) {
            if (message.mentions.members.first()) {
                target = message.mentions.members.first()
            }
        }

        if (amount > 100) amount = 100

        await message.delete().catch()

        const collected = await message.channel.messages.fetch({limit: amount})

        const collecteda = collected.filter(msg => msg.member.user.id == target.user.id)

        for (msg of collecteda.array()) {
            await msg.delete().catch()
        }

        message.channel.send("✅ **successfully deleted " + collecteda.array().length + " messages**").then(m => m.delete({timeout: 5000}))    }
}