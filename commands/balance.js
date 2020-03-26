const { MessageEmbed } = require("discord.js")
const { getBalance, createUser, userExists, updateBalance, getMember } = require("../utils.js")

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
                return message.channel.send("❌\ninvalid user - you must tag the user for this command");
            }

            if (isNaN(args[1]) || parseInt(args[1]) < 0) return
    
            let amount = (parseInt(args[1]));

            updateBalance(target, amount)

            return message.react("✅")
        }

        if (args.length == 1) {
            let target = message.mentions.members.first();

            if (!target) {
                target = getMember(message, args[0])
            }

            if (!target) {
                return message.channel.send("❌\ninvalid user")
            }

            let color;

            if (message.member.displayHexColor == "#000000") {
                color = "#FC4040";
            } else {
                color = message.member.displayHexColor;
            }

            if (!userExists(target)) createUser(target)

            const embed = new MessageEmbed()
                .setColor(color)
                .setTitle(target.user.tag)
                .setDescription("**balance** $" + getBalance(target).toLocaleString())

                .setFooter(message.member.user.tag + " | bot.tekoh.wtf")

            return message.channel.send(embed).catch(() => {
                return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
            });

        }

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle(message.member.user.tag)
            .setDescription("**balance** $" + getBalance(message.member).toLocaleString())

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });

    }
}