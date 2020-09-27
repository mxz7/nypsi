const { workMessages } = require("../lists.json")
const { getColor } = require("../utils/utils")
const { getBalance, updateBalance, userExists, createUser } = require("../economy/utils.js")
const { MessageEmbed, Message } = require("discord.js");

const cooldown = new Map()

module.exports = {
    name: "work",
    description: "work a random job and safely earn a random amount of money",
    category: "money",
    /**
     * @param {Message} message 
     * @param {Array<String>} args 
     */
    run: async (message, args) => {

        const color = getColor(message.member);

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
            return message.channel.send(new MessageEmbed().setDescription("❌ still on cooldown for " + remaining).setColor(color));
        }

        if (!userExists(message.member)) createUser(message.member)

        if (getBalance(message.member) <= 0) {
            return message.channel.send("❌ you need money to work")
        }

        if (getBalance(message.member) > 750000) {
            return message.channel.send("❌ you're too rich for this command bro")
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.author.id)
        }, 1800000);

        let earnedMax = 14

        if (getBalance(message.member) <= 100000) {
            earnedMax = 24
        } else if (getBalance(message.member) >= 250000) {
            earnedMax = 5
        }

        const earnedPercent = Math.floor(Math.random() * earnedMax) + 1
        let earned = Math.round((earnedPercent / 100) * getBalance(message.member))

        if (getBalance(message.member) >= 2000000) {
            const base = 25000
            const bonus = Math.floor(Math.random() * 75000)
            const total = base + bonus

            earned = total
        }

        const work = workMessages[Math.floor(Math.random() * workMessages.length)]

        updateBalance(message.member, getBalance(message.member) + earned)

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle("work | " + message.member.user.username)
            .setDescription(work)

            .setFooter("bot.tekoh.wtf")
        
        message.channel.send(embed).then(m => {
            

            if (getBalance(message.member) >= 2000000) {
                embed.setDescription(work + "\n\n+$**" + earned.toLocaleString() + "**")
            } else {
                embed.setDescription(work + "\n\n+$**" + earned.toLocaleString() + "** (" + earnedPercent + "%)")
            }

            setTimeout(() => {
                m.edit(embed)
            }, 1500)

        }).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });

    }
}