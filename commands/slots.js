const { getBalance, createUser, getMultiplier, updateBalance, userExists } = require("../utils.js")
const { RichEmbed } = require("discord.js")

var cooldown = new Set()

module.exports = {
    name: "slots",
    description: "play slots",
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

        if (!userExists(message.member)) {
            createUser(message.member)
        }

        if (args.length == 0) {
            return message.channel.send("❌\n$slots <amount>")
        }

        if (args[0] == "all") {
            args[0] = getBalance(message.member)
        }

        if (args[0] == "half") {
            args[0] = getBalance(message.member) / 2
        }

        if (isNaN(args[0]) || parseInt(args[0]) <= 0) {
            return message.channel.send("❌\n$slots <amount>");
        }

        const bet = (parseInt(args[0]));

        if (bet > getBalance(message.member)) {
            return message.channel.send("❌\nyou cannot afford this bet")
        }

        updateBalance(message.member, getBalance(message.member) - bet)

        const values = ["💛", "💛", "💛", "💛", "💛", "💙", "💙", "💙", "💙", "💙", "💙", "💙", "💙", "💙", "💙", "❤️", "❤️", "❤️"]

        let one = values[Math.floor(Math.random() * values.length)]
        let two = values[Math.floor(Math.random() * values.length)]
        let three = values[Math.floor(Math.random() * values.length)]


        let win = false
        let winnings = 0

        if (one == two && two == three) {
            const multiplier = getMultiplier(one)

            win = true
            winnings = Math.round(multiplier * bet)

            updateBalance(message.member, getBalance(message.member) + winnings)
        } else if (one == two) {
            win = true
            winnings = Math.round(bet * 2)

            updateBalance(message.member, getBalance(message.member) + winnings)
        }

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        let embed = new RichEmbed()
            .setColor(color)
            .setTitle("slots")
            .setDescription(one + " | " + two + " | " + three)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();
        
        message.channel.send(embed).then(m => {
            
            if (win) {
                embed.addField("**winner!!**", "**you win** $" + winnings)
                embed.setColor("#31E862")
            } else {
                embed.addField("**loser!!**", "**you lost** $" + bet)
                embed.setColor("#FF0000")
            }

            setTimeout(() => {
                m.edit(embed)
            }, 500)


        }).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });

    }
}