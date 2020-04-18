const { MessageEmbed } = require("discord.js")
const { getColor, getMember } = require("../utils.js")
const { getBalance, createUser, userExists, updateBalance, getBankBalance, getMaxBankBalance, getXp, formatBet, userExistsID, updateBalanceID, createUserID } = require("../economy/utils.js")

module.exports = {
    name: "balance",
    description: "check your balance",
    category: "money",
    run: async (message, args) => {
        
        if (!userExists(message.member)) {
            createUser(message.member)
        }

        if (message.member.user.id == "672793821850894347" && args.length == 2) {
            let target = message.mentions.members.first();
            let id = false

            if (!target) {
                target = args[0]
                if (!userExistsID(target)) {
                    return message.channel.send("❌ invalid user - you must tag the user for this command or use a user id");
                }
                id = true
            }

            if (args[1] == "reset") {
                if (id) {
                    createUserID(target)
                    return message.react("✅")
                } else {
                    createUser(target)
                    return message.react("✅")
                }
            }

            if (parseInt(args[1])) {
                args[1] = formatBet(args[1])
            } else {
                return
            }
    
            const amount = parseInt(args[1])

            if (id) {
                updateBalanceID(target, amount)
            } else {
                updateBalance(target, amount)
            }


            return message.react("✅")
        }

        const color = getColor(message.member);

        if (args.length >= 1) {
            let target = message.mentions.members.first();

            if (!target) {
                target = getMember(message, args[0])
            }

            if (!target) {
                return message.channel.send("❌ invalid user")
            }

            if (!userExists(target)) createUser(target)

            const embed = new MessageEmbed()
                .setColor(color)
                .setTitle(target.user.tag)
                .setDescription("💰 $**" + getBalance(target).toLocaleString() + "**\n" +
                    "💳 $**" + getBankBalance(target) + "** / **" + getMaxBankBalance(target) + "**")

                .setFooter("xp: " + getXp(target).toLocaleString() + " | bot.tekoh.wtf")

            return message.channel.send(embed).catch(() => {
                return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
            });

        }

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle(message.member.user.tag)
            .setDescription("💰 $**" + getBalance(message.member).toLocaleString() + "**\n" +
                    "💳 $**" + getBankBalance(message.member).toLocaleString() + "** / $**" + getMaxBankBalance(message.member).toLocaleString() + "**")

            .setFooter("xp: " + getXp(message.member).toLocaleString() + " | bot.tekoh.wtf")

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });

    }
}