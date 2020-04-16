const { MessageEmbed } = require("discord.js")
const { redditImage, getColor } = require("../utils.js")

const cooldown = new Map()

module.exports = {
    name: "ass",
    description: "get a random ass image",
    category: "nsfw",
    run: async (message, args) => {
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
            return message.channel.send("❌ still on cooldown for " + remaining );
        }

        if (!message.channel.nsfw) {
            return message.channel.send("❌ you must do this in an nsfw channel")
        }

        const { assCache } = require("../utils.js")

        if (assCache.size <= 2) {
            return message.channel.send("❌ please wait a couple more seconds..")
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        const assLinks = Array.from(assCache.keys())

        const subredditChoice = assLinks[Math.floor(Math.random() * assLinks.length)]

        const allowed = assCache.get(subredditChoice)

        const chosen = allowed[Math.floor(Math.random() * allowed.length)]

        const a = await redditImage(chosen, allowed)

        if (a == "lol") {
            return message.channel.send("❌ unable to find bdsm image")
        }

        const image = a.split("|")[0]
        const title = a.split("|")[1]
        let url = a.split("|")[2]
        const author = a.split("|")[3]

        url = "https://reddit.com" + url

        const color = getColor(message.member);

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