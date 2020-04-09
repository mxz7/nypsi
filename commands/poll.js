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
            return message.channel.send("❌\nstill on cooldown for " + remaining );
        }

        if (args.length == 0) {
            return message.channel.send("❌\n$poll <text> | (hex color)");
        }

        cooldown.set(message.member.id, new Date());
        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 10000);

        const question = args.join(" ").split("|")[0]
        
        let color = getColor(message.member);

        if (args.join(" ").includes("|")) {
            color = args.join(" ").split("|")[1]
        }

        const embed = new MessageEmbed()
            .setTitle(question)
            .setColor(color)
            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")

        
        message.channel.send(embed).then(async m => {
            await message.delete()
            await m.react("🅰")
            await m.react("🅱")
        })

    }
};