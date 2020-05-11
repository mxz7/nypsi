const { getBalance, getBankBalance, getMaxBankBalance, updateBalance, updateBankBalance, userExists, createUser, formatBet } = require("../economy/utils.js")
const { getColor } = require("../utils.js")
const { MessageEmbed } = require("discord.js")

const tax = 0.05

const cooldown = new Map()

module.exports = {
    name: "withdraw",
    description: "withdraw money from your bank",
    category: "money",
    run: async (message, args) => {

        if (!userExists(message.member)) createUser(message.member)

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 30 - diff

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
                .setTitle("withdraw help")
                .setColor(color)
                .addField("usage", "$withdraw <amount>")
                .addField("help", "you can withdraw money from your bank aslong as you have that amount available in your bank\n" +
                    "there will be a tax of **5**% when withdrawing $**100,000** or more in funds")
                .setFooter("bot.tekoh.wtf")
            return message.channel.send(embed).catch(() => {
                return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
            })
        }

        if (getBankBalance(message.member) == 0) {
            return message.channel.send("❌ you dont have any money in your bank account")
        }

        if (args[0] == "all") {
            args[0] = getBankBalance(message.member)
        }

        if (args[0] == "half") {
            args[0] = getBankBalance(message.member) / 2
        }

        if (parseInt(args[0])) {
            args[0] = formatBet(args[0])
        } else {
            return message.channel.send("❌ invalid amount")
        }

        let amount = parseInt(args[0]) 

        if (amount > getBankBalance(message.member)) {
            return message.channel.send("❌ you dont have enough money in your bank account")
        }

        if (amount <= 0) {
            return message.channel.send("❌ invalid payment")
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 30000);

        const embed = new MessageEmbed()
            .setTitle("bank withdrawal | processing")
            .setColor(color)
            .addField("your balance", "$**" + getBankBalance(message.member).toLocaleString() + "** / $**" + getMaxBankBalance(message.member).toLocaleString() + "**")
            .addField("transaction amount", "-$**" + amount.toLocaleString() + "**")
            .setFooter("bot.tekoh.wtf")

        const m = await message.channel.send(embed)

        let taxEnabled = false

        updateBankBalance(message.member, getBankBalance(message.member) - amount)

        if (amount >= 100000) {
            taxEnabled = true
            amount = amount - (amount * 0.05)
        }

        updateBalance(message.member, getBalance(message.member) + amount)

        const embed1 = new MessageEmbed()
            .setTitle("bank withdrawal | success")
            .setColor("#5efb8f")
            .addField("your balance", "$**" + getBankBalance(message.member).toLocaleString() + "** / $**" + getMaxBankBalance(message.member).toLocaleString() + "**")
            .setFooter("bot.tekoh.wtf")

        if (taxEnabled) {
            embed1.addField("transaction amount", "-$**" + amount.toLocaleString() + "** (**5**% taxxed)")
        } else {
            embed1.addField("transaction amount", "-$**" + amount.toLocaleString() + "**")
        }
        
        setTimeout(() => m.edit(embed1), 1500)
    }
}