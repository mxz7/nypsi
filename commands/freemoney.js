const { userExists, updateBalance, getBalance, createUser } = require("../economy/utils.js")
const { getColor } = require("../utils/utils")
const { MessageEmbed, Message } = require("discord.js");
const { Command, categories } = require("../utils/classes/Command.js");

const cooldown = new Map();

const cmd = new Command("freemoney", "get $1k every 5 minutes", categories.MONEY)

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    const color = getColor(message.member)

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
        return message.channel.send(new MessageEmbed().setDescription("❌ still on cooldown for " + remaining).setColor(color));
    }

    if (!userExists(message.member)) createUser(message.member)

    if (getBalance(message.member) > 100000) {
        return message.channel.send("❌ you're too rich for this command bro")
    }

    cooldown.set(message.member.id, new Date());

    setTimeout(() => {
        try {
            cooldown.delete(message.author.id);
        } catch {
            console.log(message)
            cooldown.clear()
        }
    }, 300000);

    updateBalance(message.member, getBalance(message.member) + 1000)

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

cmd.setRun(run)

module.exports = cmd