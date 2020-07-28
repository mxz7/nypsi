const { getBalance, getBankBalance, getMaxBankBalance, updateBalance, updateBankBalance, userExists, createUser, formatBet } = require("../economy/utils.js")
const { getColor } = require("../utils/utils")
const { MessageEmbed } = require("discord.js")

const cooldown = new Map()

module.exports = {
    name: "deposit",
    description: "deposit money into your bank",
    category: "money",
    aliases: ["dep"],
    run: async (message, args) => {

        if (!userExists(message.member)) createUser(message.member)

        const color = getColor(message.member)

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
            return message.channel.send(new MessageEmbed().setDescription("❌ still on cooldown for " + remaining).setColor(color));
        }

        if (args.length == 0) {
            const embed = new MessageEmbed()
                .setTitle("deposit help")
                .setColor(color)
                .addField("usage", "$deposit <amount>")
                .addField("help", "you can deposit money into your bank to keep it safe from robberies (and gambling if you have *issues*)\n" +
                    "however there is a limit to the size of your bank account, when starting, your bank has a capacity of $**50,000**, but will upgrade as your use the bot more.")
                .setFooter("bot.tekoh.wtf")
            return message.channel.send(embed).catch(() => {
                return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
            })
        }

        if (args[0] == "all") {
            args[0] = getBalance(message.member)
            const amount = parseInt(formatBet(args[0]))
            if (amount > (getMaxBankBalance(message.member) - getBankBalance(message.member))) {
                args[0] = getMaxBankBalance(message.member) - getBankBalance(message.member)
            }
        }

        if (args[0] == "half") {
            args[0] = getBalance(message.member) / 2
        }

        if (parseInt(args[0])) {
            args[0] = formatBet(args[0])
        } else {
            return message.channel.send("❌ invalid amount")
        }

        const amount = parseInt(args[0]) 

        if (amount > getBalance(message.member)) {
            return message.channel.send("❌ you cannot afford this payment")
        }

        if (amount > (getMaxBankBalance(message.member) - getBankBalance(message.member))) {
            return message.channel.send("❌ your bank is not big enough for this payment")
        }

        if (amount <= 0) {
            return message.channel.send("❌ invalid payment")
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 30000);

        const embed = new MessageEmbed()
            .setTitle("bank deposit | processing")
            .setColor(color)
            .addField("bank balance", "$**" + getBankBalance(message.member).toLocaleString() + "** / $**" + getMaxBankBalance(message.member).toLocaleString() + "**")
            .addField("transaction amount", "+$**" + amount.toLocaleString() + "**")
            .setFooter("bot.tekoh.wtf")

        const m = await message.channel.send(embed)

        updateBalance(message.member, getBalance(message.member) - amount)
        updateBankBalance(message.member, getBankBalance(message.member) + amount)

        const embed1 = new MessageEmbed()
            .setTitle("bank deposit | success")
            .setColor("#5efb8f")
            .addField("bank balance", "$**" + getBankBalance(message.member).toLocaleString() + "** / $**" + getMaxBankBalance(message.member).toLocaleString() + "**")
            .addField("transaction amount", "+$**" + amount.toLocaleString() + "**")
            .setFooter("bot.tekoh.wtf")
        
        setTimeout(() => m.edit(embed1), 1500)
    }
}