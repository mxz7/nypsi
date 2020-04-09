const { hasPadlock, setPadlock, getBalance, updateBalance, createUser, userExists } = require("../economy/utils.js")
const { MessageEmbed } = require("discord.js")

const cooldown = new Map()

module.exports = {
    name: "padlock",
    description: "buy a padlock for 10% of your current balance",
    category: "money",
    run: async (message, args) => {

        if (!userExists(message.member)) createUser(message.member)
        if (args.length == 0) {
            if (hasPadlock(message.member)) {
                const embed = new MessageEmbed()
                    .setTitle("padlock | " + message.member.user.username)
                    .setDescription("**protected** 🔒\nyou currently have a padlock")
                    .setColor("#5efb8f")
                    .setFooter("bot.tekoh.wtf")

                return message.channel.send(embed).catch(() =>{
                    return message.channel.send("**protected** 🔒\nyou currently have a padlock")
                })
            } else {
                if (getBalance(message.member) < 1000000) {
                    return message.channel.send("❌\nyou are not eligible for a padlock. you need atleast $**1,000,000**")
                }
                const embed = new MessageEmbed()
                    .setTitle("padlock | " + message.member.user.username)
                    .setDescription("**vulnerable**\nyou do not have a padlock\nyou can buy one for $**" + (Math.round(getBalance(message.member) * 0.1)).toLocaleString() + "** with $padlock buy")
                    .setColor("#e4334f")
                    .setFooter("bot.tekoh.wtf")
                return message.channel.send(embed).catch(() => {
                    return message.channel.send("**vulnerable**\nyou do not have a padlock\nyou can buy one for $**" + (Math.round(getBalance(message.member) * 0.1)).toLocaleString() + "** with $padlock buy")
                })
            }
        }

        if (args[0].toString().toLowerCase() == "buy") {

            if (cooldown.has(message.member.id)) {
                const init = cooldown.get(message.member.id)
                const curr = new Date()
                const diff = Math.round((curr - init) / 1000)
                const time = 60 - diff
    
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

            cooldown.set(message.member.id, new Date());

            setTimeout(() => {
                cooldown.delete(message.member.id);
            }, 60000);

            if (hasPadlock(message.member)) {
                const embed = new MessageEmbed()
                    .setTitle("padlock | " + message.member.user.username)
                    .setDescription("**protected** 🔒\nyou currently have a padlock")
                    .setColor("#5efb8f")
                    .setFooter("bot.tekoh.wtf")

                return message.channel.send(embed).catch(() => {
                    return message.channel.send("**protected** 🔒\nyou currently have a padlock")
                })
            }

            if (getBalance(message.member) < 1000000) {
                return message.channel.send("❌\nyou are not eligible for a padlock. you need atleast $**1,000,000**")
            }

            const cost = Math.round(getBalance(message.member) * 0.1)
            
            updateBalance(message.member, getBalance(message.member) - cost)
            setPadlock(message.member, true)
            return message.channel.send("✅\nyou have successfully bought a padlock for $**" + cost.toLocaleString() + "**")

        } else {
            if (hasPadlock(message.member)) {
                const embed = new MessageEmbed()
                    .setTitle("padlock | " + message.member.user.username)
                    .setDescription("**protected** 🔒\nyou currently have a padlock")
                    .setColor("#5efb8f")
                    .setFooter("bot.tekoh.wtf")

                return message.channel.send(embed).catch(() => {
                    return message.channel.send("**protected** 🔒\nyou currently have a padlock")
                })
            } else {
                if (getBalance(message.member) < 1000000) {
                    return message.channel.send("❌\nyou are not eligible for a padlock. you need atleast $**1,000,000**")
                }
                const embed = new MessageEmbed()
                    .setTitle("padlock | " + message.member.user.username)
                    .setDescription("**vulnerable**\nyou do not have a padlock\nyou can buy one for $**" + (Math.round(getBalance(message.member) * 0.1)).toLocaleString() + "** with $padlock buy")
                    .setColor("#e4334f")
                    .setFooter("bot.tekoh.wtf")

                return message.channel.send(embed).catch(() => {
                    return message.channel.send("**vulnerable**\nyou do not have a padlock\nyou can buy one for $**" + (Math.round(getBalance(message.member) * 0.1)).toLocaleString() + "** with $padlock buy")
                })
            }
        }

    }
}