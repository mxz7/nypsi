const cooldown = new Map();

module.exports = {
    name: "clean",
    description: "clean up bot commands and responses",
    category: "moderation",
    run: async (message, args) => {

        if (!message.member.hasPermission("MANAGE_MESSAGES")) return

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

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 15000);

        const collected = await message.channel.messages.fetch({limit: 25})

        const collecteda = collected.filter(msg => msg.member.user.id == message.client.user.id || msg.content.startsWith("$"))

        for (msg of collecteda.array()) {
            await msg.delete().catch()
        }
        message.channel.send("✅ **successfully deleted " + collecteda.array().length + " messages**").then(m => m.delete({timeout: 5000}))
    }
}