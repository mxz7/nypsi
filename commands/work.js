const { workMessages } = require("../lists.json")
const { getBalance, updateBalance, userExists, createUser } = require("../utils.js")
const { RichEmbed } = require("discord.js")

var cooldown = new Set()

module.exports = {
    name: "work",
    description: "work a random job and safely earn a random amount of money",
    category: "money",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            message.delete().catch();
            return message.channel.send("❌\nstill on cooldown").then(m => m.delete(1000));
        }

        if (!userExists(message.member)) createUser(message.member)

        if (getBalance(message.member) <= 0) {
            return message.channel.send("❌\nyou need money to work")
        }

        cooldown.add(message.member.id);

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 1800000);

        

        const earnedPercent = Math.floor(Math.random() * 30) + 5
        const earned = Math.round((earnedPercent / 100) * getBalance(message.member))

        const work = workMessages[Math.floor(Math.random() * workMessages.length)]

        updateBalance(message.member, getBalance(message.member) + earned)

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new RichEmbed()
            .setColor(color)
            .setTitle("work")
            .setDescription(work)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();
        
        message.channel.send(embed).then(m => {
            embed.setDescription(work + "\n\n+$**" + earned.toLocaleString() + "** (" + earnedPercent + "%)")

            setTimeout(() => {
                m.edit(embed)
            }, 1500);
        }).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });

    }
}