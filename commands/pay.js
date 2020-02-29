const { RichEmbed } = require("discord.js")
const { updateBalance, getBalance, userExists, createUser } = require("../utils.js")

var cooldown = new Set();

module.exports = {
    name: "pay",
    description: "give other users money",
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

        if (args.length != 2) {
            return message.channel.send("❌\n$pay <user> <amount>")
        }

        const target = message.mentions.members.first();

        if (!target) {
            return message.channel.send("❌\ninvalid user - you must tag the user for this command");
        }

        if (!userExists(target)) {
            return message.channel.send("❌\nthis user cannot recieve money")
        }

        if (!userExists(message.member)) createUser(message.member)

        if (isNaN(args[1]) || parseInt(args[1]) <= 0) {
            return message.channel.send("❌\n$pay <user> <amount>");
        }

        const amount = (parseInt(args[1]));

        if (amount > getBalance(message.member)) {
            return message.channel.send("❌\nyou cannot afford this payment")
        }

        updateBalance(message.member, getBalance(message.member) - amount)
        updateBalance(target, getBalance(target) + amount)

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new RichEmbed()
            .setTitle("transaction success!!")
            .setColor(color)
            .setDescription(message.member + " -> " + target)
            .addField(message.member.user.tag + " new balance", "   $" + getBalance(message.member) + "\n**-** $" + amount)
            .addField(target.user.tag + " new balance", "   $" + getBalance(target) + "\n**+** $" + amount)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });

    }
}