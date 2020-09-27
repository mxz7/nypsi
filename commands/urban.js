const urban = require("relevant-urban")
const { MessageEmbed, Message } = require("discord.js");
const { getColor } = require("../utils/utils");
const { Command, categories } = require("../utils/classes/Command");

const cooldown = new Map()

const cmd = new Command("urban", "get a definition from urban dictionary", categories.INFO)

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

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

    if (args.length == 0) {
        return message.channel.send("❌ $urban <definition>")
    }

    cooldown.set(message.member.id, new Date());

    setTimeout(() => {
        cooldown.delete(message.member.id);
    }, 5000);

    const result = await urban(args.join()).catch(() => {
        return message.channel.send("❌ unknown definition")
    })

    if (!result.word) return

    const embed = new MessageEmbed()
        .setTitle(result.word)
        .setDescription(result.definition + "\n\n" + result.example)
        .setColor(color)
        .setAuthor("published by " + result.author)
        .addField("👍", result.thumbsUp.toLocaleString(), true)
        .addField("👎", result.thumbsDown.toLocaleString(), true)
        .setURL(result.urbanURL)
        .setFooter("bot.tekoh.wtf")

    message.channel.send(embed)

}

cmd.setRun(run)

module.exports = cmd