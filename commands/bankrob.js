const { getColor } = require("../utils.js")
const { getBalance, createUser, updateBalance, userExists } = require("../economy/utils.js")
const Discord = require("discord.js")
const { MessageEmbed } = require("discord.js")
const shuffle = require("shuffle-array")

const cooldown = new Map()

module.exports = {
    name: "bankrob",
    description: "rob a bank for a high reward/high risk",
    category: "money",
    run: async (message, args) => {

        if (!userExists(message.member)) createUser(message.member)

        const bankWorth = new Discord.Collection()

        bankWorth.set("barclays", Math.round(getBalance(message.member) * 2.1))
        bankWorth.set("santander", Math.round(getBalance(message.member) * 2.2))
        bankWorth.set("bankofamerica", Math.round(getBalance(message.member) * 3))
        bankWorth.set("lloyds", Math.round(getBalance(message.member) * 1.5))
        bankWorth.set("hsbc", Math.round(getBalance(message.member) * 2.5))
        bankWorth.set("fleeca", Math.round(getBalance(message.member) * 1.2))
        bankWorth.set("mazebank", Math.round(getBalance(message.member) * 2))

        const color = getColor(message.member);

        if (args[0] == "status") {
            let bankList = ""

            for (bank1 of bankWorth.keys()) {
                bankList = bankList + "**" + bank1 + "** $" + bankWorth.get(bank1).toLocaleString() + "\n"
            }

            bankList = bankList + "the most you can recieve on one robbery is 75% of the bank's balance"

            const embed = new MessageEmbed()
                .setTitle("current bank balances")
                .setColor(color)
                .setDescription(bankList)
                .setFooter("bot.tekoh.wtf")
            
            
            return message.channel.send(embed).catch(() => {
                return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
            });
        }

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 600 - diff

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

        if (getBalance(message.member) < 5000) {
            return message.channel.send("❌\nyou must have atleast $5k to rob a bank")
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 600000);

        const banks = ["barclays", "santander", "bankofamerica", "lloyds", "hsbc", "fleeca", "mazebank"]

        const bank = shuffle(banks)[Math.floor(Math.random() * banks.length)]
        const amount = Math.floor(Math.random() * 60) + 15
        const caught = Math.floor(Math.random() * 15)

        let robberySuccess = true
        let robbedAmount = 0

        let percentLost
        let amountLost

        if (caught <= 6) {
            robberySuccess = false

            percentLost = Math.floor(Math.random() * 50) + 10
            amountLost = Math.round((percentLost / 100) * getBalance(message.member))

            updateBalance(message.member, getBalance(message.member) - amountLost)
        } else {
            robberySuccess = true

            robbedAmount = Math.round((amount / 100) * bankWorth.get(bank))
            
            updateBalance(message.member, getBalance(message.member) + robbedAmount)
        }

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle("bank robbery | " + message.member.user.username)
            .setDescription("robbing " + bank + "..")

            .setFooter("bot.tekoh.wtf")
        
        message.channel.send(embed).then(m => {
            
            if (robberySuccess) {
                embed.addField("**success!!**", "**you stole** $" + robbedAmount.toLocaleString() + " (" + amount + "%) from **" + bank + "**")
                embed.setColor("#5efb8f")
            } else {
                embed.addField("**you were caught**", "**you lost** $" + amountLost.toLocaleString() + " (" + percentLost + "%)")
                embed.setColor("#e4334f")
            }

            setTimeout(() => {
                m.edit(embed)
            }, 1500)


        }).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });

        

    }
}