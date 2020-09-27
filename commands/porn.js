const { MessageEmbed, Message } = require("discord.js");
const { redditImage, getColor } = require("../utils/utils")

const cooldown = new Map()

module.exports = {
    name: "porn",
    description: "get a random porn image",
    category: "nsfw",
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

        if (!message.channel.nsfw) {
            return message.channel.send("❌ you must do this in an nsfw channel")
        }

        const { pornCache } = require("../utils/imghandler")

        if (pornCache.size <= 2) {
            return message.channel.send("❌ please wait a couple more seconds..")
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        const pornLinks = Array.from(pornCache.keys())

        const subredditChoice = pornLinks[Math.floor(Math.random() * pornLinks.length)]

        const allowed = await pornCache.get(subredditChoice)

        const chosen = allowed[Math.floor(Math.random() * allowed.length)]

        const a = await redditImage(chosen, allowed)

        if (a == "lol") {
            return message.channel.send("❌ unable to find porn image")
        }

        const image = a.split("|")[0]
        const title = a.split("|")[1]
        let url = a.split("|")[2]
        const author = a.split("|")[3]

        url = "https://reddit.com" + url

        const subreddit = subredditChoice.split("r/")[1].split(".json")[0]

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
}