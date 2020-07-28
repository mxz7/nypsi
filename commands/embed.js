const { MessageEmbed } = require("discord.js");
const { getColor } = require("../utils/utils")

const cooldown = new Map();

module.exports = {
    name: "embed",
    description: "create an embed message",
    category: "info",
    run: async (message, args) => {

        if (!message.member.hasPermission("MANAGE_MESSAGES")) {
            return 
        } 

        let color = getColor(message.member)

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
            return message.channel.send(new MessageEmbed().setDescription("❌ still on cooldown for " + remaining).setColor(color));
        }

        if (args.length == 0) {
            const embed = new MessageEmbed()
                .setTitle("embed help")
                .setColor(color)
                .addField("usage", "$embed <title> | (text) | (hex color)")
                .addField("help", "with this command you can create a simple embed message\n" +
                    "**<>** required | **()** optional\n")
                .addField("examples", "$embed hello\n" +
                    "$embed hello | this is a description\n" +
                    "$embed hello | this is a description | #13c696")
                .setFooter("bot.tekoh.wtf")

            return message.channel.send(embed).catch(() => message.channel.send("❌ $embed <title> | (text) | (hex color)"))
        }

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
        
        if (mode.includes("desc")) {
            embed.setDescription(description)
        }

        
        message.channel.send(embed).then(() => {
            message.delete()
        })

    }
};