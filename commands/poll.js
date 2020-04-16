const { MessageEmbed } = require("discord.js");
const { getColor } = require("../utils.js")

const cooldown = new Map();

module.exports = {
    name: "poll",
    description: "create a poll",
    category: "info",
    run: async (message, args) => {

        if (!message.member.hasPermission("MANAGE_MESSAGES")) {
            return 
        } 

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 10 - diff

            const minutes = Math.floor(time / 60)
            const seconds = time - minutes * 60

            let remaining

            if (minutes != 0) {
                remaining = `${minutes}m${seconds}s`
            } else {
                remaining = `${seconds}s`
            }
            return message.channel.send("❌ still on cooldown for " + remaining );
        }
        
        let color = getColor(message.member);

        if (args.length == 0) {

            const embed = new MessageEmbed()
                .setTitle("poll help")
                .setColor(color)
                .addField("usage", "$poll <text> | (hex color)")
                .addField("help", "**<>** required | **()** optional\n" +
                    "after creation your message will be deleted and an embed will be created with your text and color if given\n" +
                    "the emojis used for the reactions will be 🅰 and 🅱")
                .addField("examples", "$poll this or that\n$poll this or that | #35adce")

            return message.channel.send(embed).catch(() => message.channel.send("❌ $poll <text> | (hex color)"))
        }

        cooldown.set(message.member.id, new Date());
        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 10000);

        const question = args.join(" ").split("|")[0]

        if (args.join(" ").includes("|")) {
            color = args.join(" ").split("|")[1]
        }

        const embed = new MessageEmbed()
            .setTitle(question)
            .setColor(color)
            .setFooter("bot.tekoh.wtf")

        
        message.channel.send(embed).then(async m => {
            await message.delete()
            await m.react("🅰")
            await m.react("🅱")
        })

    }
};