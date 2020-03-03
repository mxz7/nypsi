const { hasPadlock, setPadlock, getBalance, updateBalance, createUser, userExists } = require("../utils.js")
const { RichEmbed } = require("discord.js")

module.exports = {
    name: "padlock",
    description: "buy a padlock for 10% of your current balance",
    category: "money",
    run: async (message, args) => {

        if (!userExists(message.member)) createUser(message.member)
        if (args.length == 0) {
            if (hasPadlock(message.member)) {
                const embed = new RichEmbed()
                    .setTitle("padlock")
                    .setDescription(message.member + "\n\n**protected**\nyou currently have a padlock")
                    .setColor("#31E862")
                    .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
                    .setTimestamp();

                return message.channel.send(embed).catch(() =>{
                    return message.channel.send("**protected**\nyou currently have a padlock")
                })
            } else {
                if (getBalance(message.member) < 100000000) {
                    return message.channel.send("❌\nyou are not eligible for a padlock. you need atleast $**100,000,000**")
                }
                const embed = new RichEmbed()
                    .setTitle("padlock")
                    .setDescription(message.member + "\n\n**vulnerable**\nyou do not have a padlock\nyou can buy one for $**" + (Math.round(getBalance(message.member) * 0.1)).toLocaleString() + "** with $padlock buy")
                    .setColor("#FF0000")
                    .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
                    .setTimestamp();

                return message.channel.send(embed).catch(() => {
                    return message.channel.send("**vulnerable**\nyou do not have a padlock\nyou can buy one for $**" + (Math.round(getBalance(message.member) * 0.1)).toLocaleString() + "** with $padlock buy")
                })
            }
        }

        if (args[0].toString().toLowerCase() == "buy") {

            if (getBalance(message.member) < 100000000) {
                return message.channel.send("❌\nyou are not eligible for a padlock")
            }
            
            updateBalance(message.member, Math.round(getBalance(message.member) - (getBalance(message.member) * 0.1)))
            setPadlock(message.member, true)
            return message.channel.send("✅\nyou have successfully bought a padlock")

        } else {
            if (hasPadlock(message.member)) {
                const embed = new RichEmbed()
                    .setTitle("padlock")
                    .setDescription(message.member + "\n\n**protected**\nyou currently have a padlock")
                    .setColor("#31E862")
                    .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
                    .setTimestamp();

                return message.channel.send(embed).catch(() => {
                    return message.channel.send("**protected**\nyou currently have a padlock")
                })
            } else {
                if (getBalance(message.member) < 100000000) {
                    return message.channel.send("❌\nyou are not eligible for a padlock")
                }
                const embed = new RichEmbed()
                    .setTitle("padlock")
                    .setDescription(message.member + "\n\n**vulnerable**\nyou do not have a padlock\nyou can buy one for $**" + (Math.round(getBalance(message.member) * 0.1)).toLocaleString() + "** with $padlock buy")
                    .setColor("#FF0000")
                    .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
                    .setTimestamp();

                return message.channel.send(embed).catch(() => {
                    return message.channel.send("**vulnerable**\nyou do not have a padlock\nyou can buy one for $**" + (Math.round(getBalance(message.member) * 0.1)).toLocaleString() + "** with $padlock buy")
                })
            }
        }

    }
}