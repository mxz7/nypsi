const { MessageEmbed, Message } = require("discord.js");;
const { getColor } = require("../utils/utils");
const { wholesome } = require("../lists.json");
const { Command, categories } = require("../utils/classes/Command");

const cooldown = new Map();

const cmd = new Command("wholesome", "get a random wholesome picture", categories.FUN)

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (!message.guild.me.hasPermission("EMBED_LINKS")) {
        return message.channel.send("❌ i am lacking permission: 'EMBED_LINKS'");
    }

    const color = getColor(message.member);

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 5 - diff

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

    cooldown.set(message.member.id, new Date());

    setTimeout(() => {
        cooldown.delete(message.member.id);
    }, 5000);

    const embed = new MessageEmbed()
        .setColor(color)
        .setTitle("<3")
        .setImage(wholesome[Math.floor(Math.random() * wholesome.length)])

        .setFooter("bot.tekoh.wtf")
    
    message.channel.send(embed).catch(() => {
        return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
    });

}

cmd.setRun(run)

module.exports = cmd