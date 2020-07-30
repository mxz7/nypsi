const { getColor, getMember } = require("../utils/utils")
const { userExists, updateBalance, createUser, getBalance, hasPadlock, setPadlock } = require("../economy/utils.js")
const { MessageEmbed } = require("discord.js")
const { list } = require("../optout.json")

const cooldown = new Map();
const playerCooldown = new Set()

module.exports = {
    name: "rob",
    description: "rob other server members",
    category: "money",
    aliases: ["steal"],
    run: async (message, args) => {
        
        const color = getColor(message.member);

        if (cooldown.has(message.member.user.id)) {
            const init = cooldown.get(message.member.user.id)
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
            return message.channel.send(new MessageEmbed().setDescription("❌ still on cooldown for " + remaining).setColor(color));
        }

        if (args.length == 0) {
            const embed = new MessageEmbed()
                .setTitle("rob help")
                .setColor(color)
                .setFooter("bot.tekoh.wtf")
                .addField("usage", "$rob <@user>")
                .addField("help", "robbing a user is a useful way for you to make money\nyou can steal a maximum of **40**% of their balance\n" +
                    "but there is also a chance that you get caught by the police or just flat out failing the robbery\n" +
                    "you can lose up to **25**% of your balance by failing a robbery")

            return message.channel.send(embed).catch(() => message.channel.send("❌ $rob <user>"))
        }

        if (!userExists(message.member)) createUser(message.member)

        let target = message.mentions.members.first()

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
            return message.channel.send("❌ you cant rob yourself")
        }

        if (!userExists(target) || getBalance(target) <= 500) {
            return message.channel.send("❌ this user doesnt have sufficient funds")
        }

        if (getBalance(message.member) < 750) {
            return message.channel.send("❌ you need $750 in your wallet to rob someone")
        }

        cooldown.set(message.member.user.id, new Date());

        setTimeout(() => {
            try {
                cooldown.delete(message.member.user.id);
            } catch {}
        }, 600000);

        const embed = new MessageEmbed()
            .setTitle("robbery | " + message.member.user.username)
            .setColor(color)
            .setDescription("robbing " + target.user.toString() + "..")
            .setFooter("bot.tekoh.wtf")

        const embed2 = new MessageEmbed()
            .setTitle("robbery | " + message.member.user.username)
            .setDescription("robbing " + target.user.toString() + "..")
            .setFooter("bot.tekoh.wtf")
        
        const embed3 = new MessageEmbed()
            .setFooter("use $optout to optout of bot dms")

        let robberySuccess = false

        if (playerCooldown.has(target.user.id)) {
            const amount = Math.floor(Math.random() * 9) + 1
            const amountMoney = Math.round(getBalance(message.member) * (amount / 100))

            updateBalance(target, getBalance(target) + amountMoney)
            updateBalance(message.member, getBalance(message.member) - amountMoney)

            embed2.setColor("#e4334f")
            embed2.addField("**fail!!**", "**" + target.user.tag + "** has been robbed recently and is protected by a private security team\n" +
                "you were caught and paid $" + amountMoney.toLocaleString() + " (" + amount + "%)")

            embed3.setTitle("you were nearly robbed")
            embed3.setColor("#5efb8f")
            embed3.setDescription("**" + message.member.user.tag + "** tried to rob you in **" + message.guild.name + "**\n" +
                    "since you have been robbed recently, you are protected by a private security team.\nyou have been given $**" + amountMoney + "**")
        } else if (hasPadlock(target)) {
            setPadlock(target, false)

            const amount = (Math.floor(Math.random() * 35) + 5)
            const amountMoney = Math.round(getBalance(message.member) * (amount / 100))

            embed2.setColor("#e4334f")
            embed2.addField("fail!!", "**" + target.user.tag + "** had a padlock, which has now been broken")

            embed3.setTitle("you were nearly robbed")
            embed3.setColor("#5efb8f")
            embed3.setDescription("**" + message.member.user.tag + "** tried to rob you in **" + message.guild.name + "**\n" +
                "your padlock has saved you from a robbery, but it has been broken\nthey would have stolen $**" + amountMoney.toLocaleString() + "**")
        } else {
            const chance = Math.floor(Math.random() * 20)

            if (chance > 7) {
                robberySuccess = true

                const amount = (Math.floor(Math.random() * 35) + 5)
                const amountMoney = Math.round(getBalance(target) * (amount / 100))

                updateBalance(target, getBalance(target) - amountMoney)
                updateBalance(message.member, getBalance(message.member) + amountMoney)

                embed2.setColor("#5efb8f")
                embed2.addField("success!!", "you stole $**" + amountMoney.toLocaleString() + "**" + " (" + amount + "%)")

                embed3.setTitle("you have been robbed")
                embed3.setColor("#e4334f")
                embed3.setDescription("**" + message.member.user.tag + "** has robbed you in **" + message.guild.name + "**\n" +
                    "they stole a total of $**" + amountMoney.toLocaleString() + "**")
                
                playerCooldown.add(target.user.id)

                const length = Math.floor(Math.random() * 8) + 2
        
                setTimeout(() => {
                    playerCooldown.delete(target.user.id)
                }, length * 60 * 1000)
            } else {
                const amount = (Math.floor(Math.random() * 20) + 5)
                const amountMoney = Math.round(getBalance(message.member) * (amount / 100))

                updateBalance(target, getBalance(target) + amountMoney)
                updateBalance(message.member, getBalance(message.member) - amountMoney)

                embed2.setColor("#e4334f")
                embed2.addField("fail!!", "you lost $**" + amountMoney.toLocaleString() + "**" + " (" + amount + "%)")

                embed3.setTitle("you were nearly robbed")
                embed3.setColor("#5efb8f")
                embed3.setDescription("**" + message.member.user.tag + "** tried to rob you in **" + message.guild.name + "**\n" +
                    "they were caught by the police and you received $**" + amountMoney.toLocaleString() + "**")
            }
        }

        message.channel.send(embed).then(async (m) => {
            setTimeout(async () => {
                await m.edit(embed2)

                if (!list.includes(target.user.id)) {
                    if (robberySuccess) {
                        target.send("you have been robbed!!", embed3)
                    } else {
                        target.send("you were nearly robbed!!", embed3)
                    }
                }
            }, 1500)
        })
    }
}