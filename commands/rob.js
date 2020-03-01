const { userExists, updateBalance, createUser, getMember, getBalance } = require("../utils.js")
const { RichEmbed } = require("discord.js")

var cooldown = new Set();

module.exports = {
    name: "rob",
    description: "rob other players",
    category: "money",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            message.delete().catch();
            return message.channel.send("❌\nstill on cooldown").then(m => m.delete(1000));
        }

        if (args.length == 0) {
            return message.channel.send("❌\n$rob <user>")
        }

        if (!userExists(message.member)) createUser(message.member)

        let target = message.mentions.members.first()

        if (!target) target = getMember(args[0])

        if (!target) {
            return message.channel.send("❌\ninvalid user")
        }

        if (message.member == target) {
            return message.channel.send("❌\nyou cant rob yourself")
        }

        if (!userExists(target) || getBalance(target) <= 500) {
            return message.channel.send("❌\nthis user doesnt have sufficient funds")
        }

        if (getBalance(message.member) < 750) {
            return message.channel.send("❌\nyou dont have sufficient funds")
        }

        cooldown.add(message.member.id);

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 600000);

        const amount = (Math.floor(Math.random() * 50) + 25)
        
        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        let robberySuccess = true
        let robbedAmount = 0

        if (amount >= 60) {
            robberySuccess = false
            updateBalance(message.member, getBalance(message.member) - 750)
            updateBalance(target, getBalance(target) + 750)
        }

        if (robberySuccess) {
            robbedAmount = Math.round((amount / 100) * getBalance(target))

            updateBalance(target, getBalance(target) - robbedAmount)
            updateBalance(message.member, getBalance(message.member) + robbedAmount)
        }

        let embed = new RichEmbed()
            .setColor(color)
            .setTitle("robbery")
            .setDescription("robbing " + target.user + "..")

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();
        
        message.channel.send(embed).then(m => {
            
            if (robberySuccess) {
                embed.addField("**success!!**", "**you stole** $" + robbedAmount + " (" + amount + "%)")
                embed.setColor("#31E862")
            } else {
                embed.addField("**fail!!**", "**you lost** $750")
                embed.setColor("#FF0000")
            }

            setTimeout(() => {
                m.edit(embed)
            }, 1000)


        }).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });
    }
}