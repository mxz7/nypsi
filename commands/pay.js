const { MessageEmbed } = require("discord.js")
const { getMember, getColor } = require("../utils.js")
const { updateBalance, getBalance, userExists, createUser, formatBet } = require("../economy/utils.js")

const tax = 0.15

const cooldown = new Map();

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
            return message.channel.send("❌ still on cooldown for " + remaining );
        }

        const color = getColor(message.member);

        if (args.length == 0) {
            const embed = new MessageEmbed() 
                .setTitle("pay help")
                .setColor(color)
                .addField("usage", "$pay <user> <amount>")
                .addField("help", "if you or the the receiving member have more than $**500k** there will be a **15**% tax deduction from the payment")
                .setFooter("bot.tekoh.wtf")

            return message.channel.send(embed).catch(() => message.channel.send("❌ $pay <user> <amount>"))
        }

        let target = message.mentions.members.first();

        if (!target) {
            target = getMember(message, args[0])
        }

        if (!target) {
            return message.channel.send("❌ invalid user")
        }

        if (target.user.bot) {
            return message.channel.send("❌ invalid user")
        }

        if (message.member == target) {
            return message.channel.send("❌ invalid user");
        }

        if (!userExists(target)) createUser(target)

        if (!userExists(message.member)) createUser(message.member)

        if (args[1] == "all") {
            args[1] = getBalance(message.member)
        }

        if (args[1] == "half") {
            args[1] = getBalance(message.member) / 2
        }

        if (parseInt(args[1])) {
            args[1] = formatBet(args[1])
        } else {
            return message.channel.send("❌ invalid amount")
        }

        let amount = parseInt(args[1]) 

        let taxEnabled = false

        if (amount > getBalance(message.member)) {
            return message.channel.send("❌ you cannot afford this payment")
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

        const embed = new MessageEmbed()
            .setTitle("processing..")
            .setColor(color)
            
            .addField(message.member.user.tag, "$" + (getBalance(message.member) + amount).toLocaleString() + "\n**-** $" + amount.toLocaleString())
            .addField(target.user.tag, "$" + (getBalance(target) - amount).toLocaleString() + "\n**+** $" + amount.toLocaleString())

            .setFooter("bot.tekoh.wtf")

        if (taxEnabled) {
            embed.setDescription(message.member.user.toString() + " -> " + target.user.toString() + "\n**" + (tax * 100) + "**% tax")
        } else {
            embed.setDescription(message.member.user.toString() + " -> " + target.user.toString())
        }

        message.channel.send(embed).then(m => {
            const embed = new MessageEmbed()
                .setTitle("transaction success")
                .setColor("#5efb8f")
                .setDescription(message.member.user.toString() + " -> " + target.user.toString())
                .addField(message.member.user.tag, "$" + getBalance(message.member).toLocaleString())
                .addField(target.user.tag, "$" + getBalance(target).toLocaleString() + " (+$**" + amount.toLocaleString() + "**)")

                .setFooter("bot.tekoh.wtf")
            
            setTimeout(() =>{
                m.edit(embed)
            }, 1000)
        }).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });

    }
}