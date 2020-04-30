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
                .addField("usage", "$poll <title> | (text) | (hex color)")
                .addField("help", "**<>** required | **()** optional\n" +
                    "after creation your message will be deleted and an embed will be created with your text and color if given\n" +
                    "the emojis used for the reactions will be 🅰 and 🅱")
                    .addField("examples", "$poll hello\n" +
                    "$poll hello | this is a description\n" +
                    "$poll hello | this is a description | #13c696")

            return message.channel.send(embed).catch(() => message.channel.send("❌ $poll <title> | (text) | (hex color)"))
        }

        cooldown.set(message.member.id, new Date());
        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 10000);

        let mode = ""

        if (!message.content.includes("|")) {
            mode = "title_only"
        } else if (args.join(" ").split("|").length == 2) {
            mode = "title_desc"
        } else if (args.join(" ").split("|").length == 3) {
            mode = "title_desc_color"
        }

        cooldown.set(message.member.id, new Date());
        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 10000);

        const title = args.join(" ").split("|")[0]
        let description
        
        if (mode.includes("desc")) {
            description = args.join(" ").split("|")[1]
        } 

        if (mode.includes("color")) {
            color = args.join(" ").split("|")[2]
        }

        const embed = new MessageEmbed()
            .setTitle(title)
            .setColor(color)
            .setFooter("bot.tekoh.wtf")
        
        if (mode.includes("desc")) {
            embed.setDescription(description)
        }

        
        message.channel.send(embed).then(async m => {
            message.delete()
            await m.react("🅰")
            await m.react("🅱")
        })

    }
};