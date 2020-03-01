const { getBalance, createUser, updateBalance, userExists } = require("../utils.js")
const { RichEmbed } = require("discord.js")

var cooldown = new Set();


module.exports = {
    name: "coinflip",
    description: "flip a coin, double or nothing",
    category: "money",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            message.delete().catch();
            return message.channel.send("❌\nstill on cooldown").then(m => m.delete(1000));
        }

        if (!userExists(message.member)) {
            createUser(message.member)
        }

        if (args.length != 2) {
            return message.channel.send("❌\n$coinflip <h/t> <amount>")
        }

        if (args[0].toLowerCase() == "t") args[0] = "tails"

        if (args[0].toLowerCase() == "h") args[0] = "heads"

        if (args[0].toLowerCase() != "tails" && args[0].toLowerCase() != "heads") {
            return message.channel.send("❌\n$coinflip <h/t> <amount>")
        }

        if (args[1] == "all") {
            args[1] = getBalance(message.member)
        }

        if (args[1] == "half") {
            args[1] = getBalance(message.member) / 2
        }

        if (isNaN(args[1]) || parseInt(args[1]) <= 0) {
            return message.channel.send("❌\n$coinflip <h/t> <amount>")
        }

        const bet = (parseInt(args[1]));

        if (bet > getBalance(message.member)) {
            return message.channel.send("❌\nyou cannot afford this bet")
        }

        cooldown.add(message.member.id);

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        updateBalance(message.member, getBalance(message.member) - bet)

        const lols = ["heads", "tails"]

        const choice = lols[Math.floor(Math.random() * lols.length)]

        let win = false

        if (args[0] == choice) {
            win = true
            updateBalance(message.member, getBalance(message.member) + (bet * 2))
        }

        delete lols
        delete choice

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }


        let embed = new RichEmbed()
            .setColor(color)
            .setTitle("coinflip")
            .setDescription("**bet** $" + bet + "\n" + 
                "**side** " + args[0].toLowerCase() + "\n" +
                "*throwing..*")

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();
        
        message.channel.send(embed).then(m => {

            embed.setDescription("**bet** $" + bet + "\n" + 
                "**side** " + args[0].toLowerCase() + "\n" +
                "**threw** " + choice)
            
            if (win) {
                embed.addField("**winner!!**", "**you win** $" + (bet * 2))
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