const { RichEmbed } = require("discord.js")

var cooldown = new Set()

module.exports = {
    name: "pp",
    description: "accurate prediction of your pp size",
    category: "fun",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            message.delete().catch();
            return message.channel.send("❌\nstill on cooldown").then(m => m.delete(1000));
        }

        cooldown.add(message.member.id);

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 2500);

        const size = Math.floor(Math.random() * 15)
        let sizeMsg = "8"

        for (let i = 0; i < size; i++) {
            sizeMsg = sizeMsg + "="
        }
        sizeMsg = sizeMsg + "D"

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new RichEmbed()
            .setColor(color)
            .setTitle("pp predictor 5000")
            .setDescription(message.member + "\n\n" + sizeMsg)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });

    }  
}