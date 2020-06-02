const { getColor, getMember } = require("../utils.js")
const { userExists, updateBalance, createUser, getBalance, hasPadlock, setPadlock } = require("../economy/utils.js")
const { MessageEmbed } = require("discord.js")
const { list } = require("../optout.json")

const cooldown = new Map();
const playerCooldown = new Set()

module.exports = {
    name: "rob",
    description: "rob other server members",
    category: "money",
    run: async (message, args) => {

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
            return message.channel.send("❌ still on cooldown for " + remaining );
        }
        
        const color = getColor(message.member);

        if (args.length == 0) {
            const embed = new MessageEmbed()
                .setTitle("rob help")
                .setColor(color)
                .setFooter("bot.tekoh.wtf")
                .addField("usage", "$rob <user>")
                .addField("help", "robbing a user is a useful way for you to make money\nyou can rob a maximum of **45**% of their balance\n" +
                    "but there is also a chance that you get caught by the police or just flat out failing the robbery\n" +
                    "you can lose up to **30**% of your balance by failing a robbery")

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
            return message.channel.send("❌ you need $1k in your wallet to rob someone")
        }

        cooldown.set(message.member.user.id, new Date());

        setTimeout(() => {
            try {
                cooldown.delete(message.member.user.id);
            } catch {}
        }, 600000);

        if (playerCooldown.has(target.user.id)) {
            const amount = Math.floor(Math.random() * 9) + 1
            const amountMoney = Math.round(getBalance(message.member) * (amount / 100))

            updateBalance(target, getBalance(target) + amountMoney)
            updateBalance(message.member, getBalance(message.member) - amountMoney)

            const embed = new MessageEmbed()
                .setColor(color)
                .setTitle("robbery | " + message.member.user.username)
                .setDescription("robbing " + target.user.toString() + "..")
                .setFooter("bot.tekoh.wtf")

            target.send("**you were nearly robbed!!**\nyou were nearly robbed by **" + message.member.user.tag + "** in **" + message.guild.name + "** \n" +
                "since you have been robbed recently, you were protected by a private security team and received $" + amountMoney)

            message.channel.send(embed).then(m => {
                embed.setColor("#e4334f")
                embed.addField("**fail!!**", "**" + target.user.tag + "** has been robbed recently and is protected by a private security team\n" +
                    "you were caught and paid $" + amountMoney.toLocaleString() + " (" + amount + "%)")
                
                setTimeout(() => {
                    m.edit(embed)
                }, 1000)
            })
            return
        }

        const amount = (Math.floor(Math.random() * 45) + 10)

        const caught = Math.floor(Math.random() * 15)

        let robberySuccess = true
        let robbedAmount = Math.round((amount / 100) * getBalance(target))

        let caughtByPolice = false
        let percentReturned
        let amountReturned

        if (hasPadlock(target)) {
            setPadlock(target, false)

            if (!list.includes(target.user.id)) {
                target.send("**your padlock has saved you from a robbery!!**\nyou were nearly robbed by **" + message.member.user.tag + "** in **" + message.guild.name +"**\nthey would have stolen a total of $**" + robbedAmount.toLocaleString() + "**\n*your padlock is now broken*").catch(() => {
                    
                })
            }

            const embed = new MessageEmbed()
                .setColor(color)
                .setTitle("robbery | " + message.member.user.username)
                .setDescription("robbing " + target.user.toString() + "..")

                .setFooter("bot.tekoh.wtf")
        
            message.channel.send(embed).then(m => {

                embed.setColor("#e4334f")
                embed.addField("**fail!!**", "**" + target.user.tag + "** had a padlock, which has now been broken")

                setTimeout(() => {
                    m.edit(embed)
                }, 1000)


            }).catch(() => {
                return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
            });
            return
        }

        if (caught <= 3) {
            caughtByPolice = true
            robberySuccess = false

            percentReturned = (Math.floor(Math.random() * 20) + 10)

            amountReturned = Math.round((percentReturned / 100) * getBalance(message.member))

            if (!list.includes(target.user.id)) {
                target.send("**you were nearly robbed!!**\n**" + message.member.user.tag + "** tried to rob you in **" + message.guild.name +"** but they were caught by the police\nthe police have given you $**" + amountReturned.toLocaleString() + "** for your troubles\n*use $optout to optout of bot dms*").catch(() => {
                })
            }

            updateBalance(target, getBalance(target) + amountReturned)
            updateBalance(message.member, getBalance(message.member) - amountReturned)
        } else if (amount >= 45) {
            robberySuccess = false

            percentReturned = (Math.floor(Math.random() * 10) + 5)

            amountReturned = Math.round((percentReturned / 100) * getBalance(message.member))

            if (!list.includes(target.user.id)) {
                target.send("**you were nearly robbed!!**\n**" + message.member.user.tag + "** tried to rob you in **" + message.guild.name +"** but they failed\nyou have been given $**" + amountReturned.toLocaleString() + "** from their balance\n*use $optout to optout of bot dms*").catch(() => {
                })
            }

            updateBalance(message.member, getBalance(message.member) - amountReturned)
            updateBalance(target, getBalance(target) + amountReturned)
        }

        if (robberySuccess) {
            robbedAmount = Math.round((amount / 100) * getBalance(target))

            if (!list.includes(target.user.id)) {
                target.send("**you have been robbed!!**\nyou were robbed by **" + message.member.user.tag + "** in **" + message.guild.name + "**\nthey stole a total of $**" + robbedAmount.toLocaleString() + "**\n*use $optout to optout of bot dms*").catch(() => {

                })
            }

            playerCooldown.add(target.user.id)

            setTimeout(() => {
                playerCooldown.delete(target.user.id)
            }, 600000)

            updateBalance(target, getBalance(target) - robbedAmount)
            updateBalance(message.member, getBalance(message.member) + robbedAmount)
        }

        let embed = new MessageEmbed()
            .setColor(color)
            .setTitle("robbery | " + message.member.user.username)
            .setDescription("robbing " + target.user.toString() + "..")

            .setFooter("bot.tekoh.wtf")
        
        message.channel.send(embed).then(m => {
            
            if (robberySuccess && !caughtByPolice) {
                embed.addField("**success!!**", "**you stole** $" + robbedAmount.toLocaleString() + " (" + amount + "%)")
                embed.setColor("#5efb8f")
            } else if (caughtByPolice) {
                embed.setColor("#e4334f")
                embed.addField("**you were caught by the police!!**", "**" + target.user.tag + "** was given $" + amountReturned.toLocaleString() + " (" + percentReturned + "%)" +
                    "\nfrom your balance for their troubles")
            } else {
                embed.addField("**fail!!**", "**you lost** $" + amountReturned.toLocaleString() + " (" + percentReturned + "%)")
                embed.setColor("#e4334f")
            }

            setTimeout(() => {
                m.edit(embed)
            }, 1000)


        }).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });
    }
}