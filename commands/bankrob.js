const { getBalance, createUser, updateBalance, userExists } = require("../utils.js")
const Discord = require("discord.js")
const { RichEmbed } = require("discord.js")
const shuffle = require("shuffle-array")

var cooldown = new Set()

var bankWorth = new Discord.Collection()

bankWorth.set("barclays", 100000)
bankWorth.set("santander", 50000)
bankWorth.set("bankofamerica", 175000)
bankWorth.set("lloyds", 60000)
bankWorth.set("hsbc", 75000)
bankWorth.set("fleeca", 25000)
bankWorth.set("mazebank", 90000)

module.exports = {
    name: "bankrob",
    description: "rob a bank for a high reward/high risk",
    category: "money",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            message.delete().catch();
            return message.channel.send("❌\nstill on cooldown").then(m => m.delete(1000));
        }

        if (!userExists(message.member)) createUser(message.member)


        if (getBalance(message.member) < 5000) {
            return message.channel.send("❌\nyou must have atleast $5k to rob a bank")
        }

        cooldown.add(message.member.id);

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 1800000);

        const banks = ["barclays", "santander", "bankofamerica", "lloyds", "hsbc", "fleeca", "mazebank"]

        const bank = shuffle(banks)[Math.floor(Math.random() * banks.length)]
        const amount = Math.floor(Math.random() * 60) + 15
        const caught = Math.floor(Math.random() * 15)

        let robberySuccess = true
        let robbedAmount = 0

        let percentLost
        let amountLost

        if (caught <= 11) {
            robberySuccess = false

            percentLost = Math.floor(Math.random() * 70) + 10
            amountLost = Math.round((percentLost / 100) * getBalance(message.member))

            updateBalance(message.member, getBalance(message.member) - amountLost)
        } else {
            robberySuccess = true

            robbedAmount = Math.round((amount / 100) * bankWorth.get(bank))
            
            updateBalance(message.member, getBalance(message.member) + robbedAmount)
        }

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        let embed = new RichEmbed()
            .setColor(color)
            .setTitle("bank robbery")
            .setDescription("robbing " + bank + "..")

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();
        
        message.channel.send(embed).then(m => {
            
            if (robberySuccess) {
                embed.addField("**success!!**", "**you stole** $" + robbedAmount + " (" + amount + "%) from **" + bank + "**")
                embed.setColor("#31E862")
            } else {
                embed.addField("**you were caught**", "**you lost** $" + amountLost + " (" + percentLost + "%)")
                embed.setColor("#FF0000")
            }

            setTimeout(() => {
                m.edit(embed)
            }, 3000)


        }).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });

        

    }
}