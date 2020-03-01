const { topAmount } = require("../utils.js")
const { RichEmbed } = require("discord.js")

var cooldown = new Set()

module.exports = {
    name: "baltop",
    description: "view top users",
    category: "money",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            message.delete().catch();
            return message.channel.send("❌\nstill on cooldown").then(m => m.delete(1000));
        }

        cooldown.add(message.member.id);

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        let amount

        if (args.length == 0) {
            args[0] = 5
        }

        if (isNaN(args[0]) || parseInt(args[0]) <= 0) {
            args[0] = 5;
        }

        amount = parseInt(args[0]);

        if (amount > 10 && message.member.user.id != "672793821850894347") amount = 10

        const balTop = topAmount(message.guild, amount)

        let filtered = balTop.filter(function (el) {
            return el != null;
        });

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }
          
        const embed = new RichEmbed()
            .setTitle("richest people in this server")
            .setColor(color)
            .addField("top " + filtered.length, filtered)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });

    }
}