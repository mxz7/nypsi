const { MessageEmbed, Message } = require("discord.js");;
const { getColor } = require("../utils/utils")

const cooldown = new Map();

module.exports = {
    name: "ezpoll",
    description: "simple poll builder",
    category: "info",
    /**
     * @param {Message} message 
     * @param {Array<String>} args 
     */
    run: async (message, args) => {

        const color = getColor(message.member)

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            let time = 10 - diff

            if (!message.member.hasPermission("MANAGE_MESSAGES")) {
                time = 60 - diff
            }

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

        if (args.length == 0) {

            const embed = new MessageEmbed()
                .setTitle("ezpoll help")
                .setColor(color)
                .addField("usage", "$ezpoll <choices..>")
                .addField("help", "after creation your message will be deleted and an embed will be created to act as the poll\n" +
                    "every word will be an option in the poll, with a maximum of 4 and minimum of two")
                    .addField("example", "$poll option1 option2")

            return message.channel.send(embed).catch(() => message.channel.send("❌ $ezpoll <choices..>"))
        }

        if (args.length < 2) {
            return message.channel.send("❌ not enough options")
        }

        if (message.member.hasPermission("MANAGE_MESSAGES") && !message.member.hasPermission("ADMINISTRATOR")) {
            cooldown.set(message.member.id, new Date());
            setTimeout(() => {
                cooldown.delete(message.member.id);
            }, 10000);
        }

        if (!message.member.hasPermission("MANAGE_MESSAGES") && !message.member.hasPermission("ADMINISTRATOR")) {
            cooldown.set(message.member.id, new Date());
            setTimeout(() => {
                cooldown.delete(message.member.id);
            }, 60000)
        }

        let choices = ""
        let count = 1

        for (option of args) {
            if (count > 4) break
                
            if (count == 1) {
                choices = "1️⃣ " + option
            } else if (count == 2) {
                choices = choices + "\n2️⃣ " + option
            } else if (count == 3) {
                choices = choices + "\n3️⃣ " + option
            } else if (count == 4) {
                choices = choices + "\n4️⃣ " + option
            }

            count++
        }

        const embed = new MessageEmbed()
            .setTitle("poll by " + message.member.user.username)
            .setColor(color)
            .setDescription(choices)
        
        message.channel.send(embed).then(async m => {
            await message.delete().catch()
            
            if (args.length >= 2) {
                await m.react("1️⃣")
                await m.react("2️⃣")
            }

            if (args.length >= 3) await m.react("3️⃣")
            if (args.length >= 4) await m.react("4️⃣")
        })

    }
};