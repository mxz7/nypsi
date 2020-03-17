const { RichEmbed } = require("discord.js")
const { updateBalance, getBalance, userExists, createUser, getMember, formatBet } = require("../utils.js")

const tax = 0.15

var cooldown = new Map();

module.exports = {
    name: "pay",
    description: "give other users money",
    category: "money",
    run: async (message, args) => {

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

        if (args.length != 2) {
            return message.channel.send("❌\n$pay <user> <amount>")
        }

        let target = message.mentions.members.first();

        if (!target) {
            target = getMember(message, args[0])
        }

        if (!target) {
            return message.channel.send("❌\ninvalid user")
        }

        if (target.user.bot) {
            return message.channel.send("❌\ninvalid user")
        }

        if (message.member == target) {
            return message.channel.send("❌\ninvalid user");
        }

        if (!userExists(target)) createUser(target)

        if (!userExists(message.member)) createUser(message.member)

        if (args[1] == "all") {
            args[1] = getBalance(message.member)
        }

        if (args[1] == "half") {
            args[1] = getBalance(message.member) / 2
        }

        if (isNaN(args[1]) || parseInt(args[1]) <= 0) {
            if (!isNaN(formatBet(args[1]) || !parseInt(formatBet[args[1]]))) {
                args[1] = formatBet(args[1])
            } else {
                return message.channel.send("❌\n$pay <user> <amount>")
            }
        }

        let amount = parseInt(args[1]) 

        let taxEnabled = false

        if (amount > getBalance(message.member)) {
            return message.channel.send("❌\nyou cannot afford this payment")
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 10000);

        updateBalance(message.member, getBalance(message.member) - amount)
        updateBalance(target, getBalance(target) + (amount - Math.round(amount * tax)))

        if (getBalance(message.member) >= 500000 || getBalance(target) >= 500000) {
            taxEnabled = true
            amount = amount - Math.round(amount * tax)
        }

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new RichEmbed()
            .setTitle("processing..")
            .setColor(color)
            
            .addField(message.member.user.tag, "$" + (getBalance(message.member) + amount).toLocaleString() + "\n**-** $" + amount.toLocaleString())
            .addField(target.user.tag, "$" + (getBalance(target) - amount).toLocaleString() + "\n**+** $" + amount.toLocaleString())

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();

        if (taxEnabled) {
            embed.setDescription(message.member + " -> " + target + "\n**" + (tax * 100) + "**% tax")
        } else {
            embed.setDescription(message.member + " -> " + target)
        }

        message.channel.send(embed).then(m => {
            const embed = new RichEmbed()
                .setTitle("transaction success")
                .setColor("#31E862")
                .setDescription(message.member + " -> " + target)
                .addField(message.member.user.tag, "$" + getBalance(message.member).toLocaleString())
                .addField(target.user.tag, "$" + getBalance(target).toLocaleString() + " (+$**" + amount.toLocaleString() + "**)")

                .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
                .setTimestamp();
            
            setTimeout(() =>{
                m.edit(embed)
            }, 1000)
        }).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });

    }
}