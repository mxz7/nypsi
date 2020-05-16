const { workMessages } = require("../lists.json")
const { getColor } = require("../utils.js")
const { getBalance, updateBalance, userExists, createUser } = require("../economy/utils.js")
const { MessageEmbed } = require("discord.js")

const cooldown = new Map()

module.exports = {
    name: "work",
    description: "work a random job and safely earn a random amount of money",
    category: "money",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 1800 - diff

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

        if (!userExists(message.member)) createUser(message.member)

        if (getBalance(message.member) <= 0) {
            return message.channel.send("❌ you need money to work")
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 1800000);

        let earnedMax = 14

        if (getBalance(message.member) <= 1000000) earnedMax = 24

        const earnedPercent = Math.floor(Math.random() * earnedMax) + 1
        const earned = Math.round((earnedPercent / 100) * getBalance(message.member))

        const work = workMessages[Math.floor(Math.random() * workMessages.length)]

        updateBalance(message.member, getBalance(message.member) + earned)

        const color = getColor(message.member);

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle("work | " + message.member.user.username)
            .setDescription(work)

            .setFooter("bot.tekoh.wtf")
        
        message.channel.send(embed).then(m => {
            embed.setDescription(work + "\n\n+$**" + earned.toLocaleString() + "** (" + earnedPercent + "%)")

            setTimeout(() => {
                m.edit(embed)
            }, 1500)

        }).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });

    }
}