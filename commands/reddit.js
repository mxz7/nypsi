const { MessageEmbed, Message } = require("discord.js");
const { redditImage, getColor } = require("../utils/utils")
const fetch = require("node-fetch");
const { Command, categories } = require("../utils/classes/Command");

const cooldown = new Map()

const cmd = new Command("reddit", "get a random image from any subreddit", categories.INFO)

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
        return message.channel.send(new MessageEmbed().setDescription("❌ still on cooldown for " + remaining).setColor(color));1
    }

    if (args.length == 0) {
        return message.channel.send("❌ $reddit <subreddit>")
    }

    cooldown.set(message.member.id, new Date());

    setTimeout(() => {
        cooldown.delete(message.member.id);
    }, 5000);

    let allowed

    try {
        const res = await fetch("https://www.reddit.com/r/" + args[0] + ".json?limit=100").then(a => a.json())

        allowed = res.data.children.filter(post => !post.data.is_self)

    } catch (e) {
        return message.channel.send("❌  invalid subreddit")
    }

    const chosen = allowed[Math.floor(Math.random() * allowed.length)]

    if (!chosen) {
        return message.channel.send("❌ unable to find image")
    }

    if (chosen.data.over_18 && !message.channel.nsfw) {
        return message.channel.send("❌ you must do this in an nsfw channel")
    }

    const a = await redditImage(chosen, allowed)

    const image = a.split("|")[0]
    const title = a.split("|")[1]
    let url = a.split("|")[2]
    const author = a.split("|")[3]

    url = "https://reddit.com" + url

    if (image == "lol") {
        return message.channel.send("❌ unable to find image")
    }

    const subreddit = args[0]

    const embed = new MessageEmbed()
        .setColor(color)
        .setTitle(title)
        .setAuthor("u/" + author + " | r/" + subreddit)
        .setURL(url)
        .setImage(image)
        .setFooter("bot.tekoh.wtf")

    message.channel.send(embed).catch(() => {
        return message.channel.send("❌ i may be missing permission: 'EMBED_LINKS'")
    })

}

cmd.setRun(run)

module.exports = cmd