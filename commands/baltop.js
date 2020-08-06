const { getColor } = require("../utils/utils")
const { topAmount } = require("../economy/utils.js")
const { MessageEmbed } = require("discord.js")

const cooldown = new Map()

module.exports = {
    name: "baltop",
    description: "view top users",
    category: "money",
    aliases: ["top"],
    run: async (message, args) => {

        const color = getColor(message.member);

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

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.author.id);
        }, 10000);

        let amount

        if (args.length == 0) {
            args[0] = 5
        }

        if (isNaN(args[0]) || parseInt(args[0]) <= 0) {
            args[0] = 5;
        }

        amount = parseInt(args[0]);

        if (amount > 10 && !message.member.hasPermission("ADMINISTRATOR")) amount = 10

        if (amount < 5) amount = 5

        const balTop = await topAmount(message.guild, amount)

        let filtered = balTop.filter(function (el) {
            return el != null;
        });
          
        const embed = new MessageEmbed()
            .setTitle("top " + filtered.length)
            .setColor(color)
            .setDescription(filtered)

            .setFooter("bot.tekoh.wtf")

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });

    }
}