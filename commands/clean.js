module.exports = {
    name: "clean",
    description: "clean up bot commands and responses",
    category: "moderation",
    run: async (message, args) => {

        if (!message.member.hasPermission("MANAGE_MESSAGES")) return

        if (!message.guild.me.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send("❌ \ni am lacking permission: 'MANAGE_MESSAGES'");
        }

        const collected = await message.channel.messages.fetch({limit: 25})

        const collecteda = collected.filter(msg => msg.member.user.id == message.client.user.id || msg.content.startsWith("$"))

        for (msg of collecteda.array()) {
            await msg.delete().catch()
        }
        message.channel.send("✅ **successfully deleted " + collecteda.array().length + " messages**").then(m => m.delete({timeout: 5000}))
    }
}