const { userExists, updateBalance, getBalance, createUser } = require("../economy/utils.js")
const { getColor } = require("../utils/utils")
const { MessageEmbed } = require("discord.js")

const cooldown = new Map();

module.exports = {
    name: "freemoney",
    description: "get $1k every 5 minutes",
    category: "money",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 300 - diff

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

        if (getBalance(message.member) > 100000) {
            return message.channel.send("❌ you're too rich for this command bro")
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 300000);

        if (!userExists(message.member)) createUser(message.member)

        updateBalance(message.member, getBalance(message.member) + 1000)

        const color = getColor(message.member)

        const embed = new MessageEmbed()
            .setTitle("freemoney | " + message.member.user.username)
            .setDescription("+$**1,000**")
            .setFooter("bot.tekoh.wtf")
            .setColor(color)

        message.channel.send(embed).then(msg => {
            embed.setDescription("+$**1,000**\nnew balance: $**" + getBalance(message.member).toLocaleString() + "**")
            setTimeout(() => {
                msg.edit(embed)
            }, 1000)
        })
    }
}