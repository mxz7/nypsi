const { MessageEmbed, Message } = require("discord.js");
const { getColor } = require("../utils/utils")

const cooldown = new Map()

module.exports = {
    name: "delp",
    description: "bulk delete/purge your own messages",
    category: "moderation",
    aliases: ["dp"],
    /**
     * @param {Message} message 
     * @param {Array} args 
     */
    run: async (message, args) => {

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

        if (!message.guild.me.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send("❌ i am lacking permission: 'MANAGE_MESSAGES'");
        }

        if (args.length == 0) {
            args[0] = 5
        }

        if (isNaN(args[0]) || parseInt(args[0]) <= 0) {
            return message.channel.send("❌ $delp <amount>");
        }

        let amount = parseInt(args[0])

        if (!message.member.hasPermission("ADMINISTRATOR")) {
            if (!message.member.hasPermission("MANAGE_MESSAGES")) {
                if (amount > 10) {
                    amount = 10
                }
            } else {
                if (amount > 50) {
                    amount = 50
                }
            }
            cooldown.set(message.member.id, new Date());
    
            setTimeout(() => {
                cooldown.delete(message.author.id);
            }, 30000);
        }

        if (amount > 100) amount = 100

        let collected

        if (message.member.user.id == "672793821850894347") {
            const collected = await message.channel.messages.fetch({limit: 50})

            const collecteda = collected.filter(msg => {
                if (!msg.member) {
                } else {
                    return msg.member.user.id == "672793821850894347"
                }
            })

            return await message.channel.bulkDelete(collecteda)
        }

        if (amount <= 6) {
            collected = await message.channel.messages.fetch({limit: 25})
        } else {
            collected = await message.channel.messages.fetch({limit: 100})
        }
        
        const collecteda = collected.filter(msg => {
            if (!msg.member) {
            } else {
                return msg.member.user.id == message.member.user.id
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

        await message.channel.bulkDelete(collecteda)
    }
}