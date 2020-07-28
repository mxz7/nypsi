const { hasPadlock, setPadlock, getBalance, updateBalance, createUser, userExists, getPadlockPrice } = require("../economy/utils.js")
const { getColor } = require("../utils/utils")
const { MessageEmbed } = require("discord.js")

const cooldown = new Map()

module.exports = {
    name: "padlock",
    description: "buy a padlock to protect your wallet",
    category: "money",
    run: async (message, args) => {

        if (!userExists(message.member)) createUser(message.member)

        const color = getColor(message.member);

        const embed = new MessageEmbed()
            .setTitle("padlock | " + message.member.user.username)
            .setFooter("bot.tekoh.wtf")
        
        const padlockPrice = getPadlockPrice()

        if (args.length == 1 && args[0].toLowerCase() == "buy") {
            if (hasPadlock(message.member)) {
                embed.setColor("#5efb8f")
                embed.setDescription("**protected** 🔒\nyou currently have a padlock")
                return await message.channel.send(embed).catch()
            }

            if (getBalance(message.member) < padlockPrice) {
                return await message.channel.send("❌ you cannot currently afford a padlock")
            }

            if (cooldown.has(message.member.user.id)) {
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
                return message.channel.send(new MessageEmbed().setDescription("❌ still on cooldown for " + remaining).setColor(color));
            }

            cooldown.set(message.member.user.id, new Date());

            setTimeout(() => {
                cooldown.delete(message.member.user.id);
            }, 60000);

            updateBalance(message.member, getBalance(message.member) - padlockPrice)
            setPadlock(message.member, true)
            return await message.channel.send("✅ you have successfully bought a padlock for $**" + padlockPrice.toLocaleString() + "**")
        } else {
            if (hasPadlock(message.member)) {
                embed.setColor("#5efb8f")
                embed.setDescription("**protected** 🔒\nyou currently have a padlock")
                return await message.channel.send(embed).catch()
            } else {
                embed.setDescription("**vulnerable** 🔓\nyou do not have a padlock\nyou can buy one for $**" + padlockPrice.toLocaleString() + "** with $padlock buy")
                embed.setColor("#e4334f")
                return await message.channel.send(embed).catch()
            }
        }
    }
}