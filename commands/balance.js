const { MessageEmbed } = require("discord.js")
const { getColor, getMember } = require("../utils.js")
const { getBalance, createUser, userExists, updateBalance } = require("../economy/utils.js")

module.exports = {
    name: "balance",
    description: "check your balance",
    category: "money",
    run: async (message, args) => {
        
        if (!userExists(message.member)) {
            createUser(message.member)
        }

        if (message.member.user.id == "672793821850894347" && args.length == 2) {
            const target = message.mentions.members.first();

            if (!target) {
                return message.channel.send("❌ invalid user - you must tag the user for this command");
            }

            if (isNaN(args[1]) || parseInt(args[1]) < 0) return
    
            let amount = (parseInt(args[1]));

            updateBalance(target, amount)

            return message.react("✅")
        }

        const color = getColor(message.member);

        if (args.length >= 1) {
            let target = message.mentions.members.first();

            if (!target) {
                target = getMember(message, args[0])
            }

            if (!target) {
                return message.channel.send("❌ invalid user")
            }

            if (!userExists(target)) createUser(target)

            const embed = new MessageEmbed()
                .setColor(color)
                .setTitle(target.user.tag)
                .setDescription("**balance** $" + getBalance(target).toLocaleString())

                .setFooter("bot.tekoh.wtf")

            return message.channel.send(embed).catch(() => {
                return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
            });

        }

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle(message.member.user.tag)
            .setDescription("**balance** $" + getBalance(message.member).toLocaleString())

            .setFooter("bot.tekoh.wtf")

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });

    }
}