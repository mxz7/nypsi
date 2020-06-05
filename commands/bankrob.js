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

        if (getBalance(message.member) < 1000) {
            return await message.channel.send("❌ you must have atleast $1k")
        }

        const bankWorth = new Discord.Collection()

        if (getBalance(message.member) > 500000) {
            bankWorth.set("barclays", Math.round(getBalance(message.member) * 1))
            bankWorth.set("santander", Math.round(getBalance(message.member) * 0.8))
            bankWorth.set("bankofamerica", Math.round(getBalance(message.member) * 1.25))
            bankWorth.set("lloyds", Math.round(getBalance(message.member) * 0.75))
            bankWorth.set("hsbc", Math.round(getBalance(message.member) * 0.9))
            bankWorth.set("fleeca", Math.round(getBalance(message.member) * 0.5))
            bankWorth.set("mazebank", Math.round(getBalance(message.member) * 1))
        } else {
            bankWorth.set("barclays", Math.round(getBalance(message.member) * 2))
            bankWorth.set("santander", Math.round(getBalance(message.member) * 1.7))
            bankWorth.set("bankofamerica", Math.round(getBalance(message.member) * 2.5))
            bankWorth.set("lloyds", Math.round(getBalance(message.member) * 1.5))
            bankWorth.set("hsbc", Math.round(getBalance(message.member) * 1.8))
            bankWorth.set("fleeca", Math.round(getBalance(message.member) * 1.1))
            bankWorth.set("mazebank", Math.round(getBalance(message.member) * 2))
        }

        const color = getColor(message.member);

        if (args[0] == "status") {
            let bankList = ""

            for (bank1 of bankWorth.keys()) {
                bankList = bankList + "**" + bank1 + "** $" + bankWorth.get(bank1).toLocaleString() + "\n"
            }

            bankList = bankList + "the most you can recieve on one robbery is 50% of the bank's balance"

            const embed = new MessageEmbed()
                .setTitle("current bank balances")
                .setColor(color)
                .setDescription(bankList)
                .setFooter("bot.tekoh.wtf")
            
            
            return message.channel.send(embed).catch(() => {
                return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
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
            return message.channel.send("❌ still on cooldown for " + remaining );
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

        if (caught <= 10) {
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
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });

        

    }
}