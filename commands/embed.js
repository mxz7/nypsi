const { MessageEmbed } = require("discord.js");
const { getColor } = require("../utils.js")

const cooldown = new Map();

module.exports = {
    name: "embed",
    description: "create an embed message",
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
            return message.channel.send("❌\nstill on cooldown for " + remaining );
        }

        if (args.length == 0) {
            return message.channel.send("❌\n$embed <title> | (text) | (hex color)");
        }

        let mode = ""

        console.log(args.join(" ").split("|").length)

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
        let color = getColor(message.member);
        
        if (mode.includes("desc")) {
            description = args.join(" ").split("|")[1]
        } 

        if (mode.includes("color")) {
            color = args.join(" ").split("|")[2]
        }

        const embed = new MessageEmbed()
            .setTitle(title)
            .setColor(color)
            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")
        
        if (mode.includes("desc")) {
            embed.setDescription(description)
        }

        
        message.channel.send(embed).then(() => {
            message.delete()
        })

    }
};