const { MessageEmbed } = require("discord.js")
const { redditImage } = require("../utils.js")
const fetch = require("node-fetch")

var cooldown = new Map()

module.exports = {
    name: "reddit",
    description: "get a random image from any subreddit",
    category: "info",
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
            return message.channel.send("❌\nstill on cooldown for " + remaining );
        }

        if (args.length == 0) {
            return message.channel.send("❌\n$reddit <subreddit>")
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        let allowed

        try {
            const res = await fetch("https://www.reddit.com/r/" + args[0] + ".json").then(a => a.json())

            allowed = res.data.children.filter(post => !post.data.is_self)

        } catch (e) {
            return message.channel.send("❌\n invalid subreddit")
        }

        const chosen = allowed[Math.floor(Math.random() * allowed.length)]

        if (chosen.data.over_18 && !message.channel.nsfw) {
            return message.channel.send("❌\nyou must do this in an nsfw channel")
        }

        const a = await redditImage(chosen, allowed)

        const image = a.split("|")[0]
        const title = a.split("|")[1]
        let url = a.split("|")[2]
        const author = a.split("|")[3]

        url = "https://reddit.com" + url

        if (image == "lol") {
            return message.channel.send("❌\nunable to find image")
        }

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const subreddit = args[0]

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle(title)
            .setAuthor("u/" + author + " | r/" + subreddit)
            .setURL(url)
            .setImage(image)
            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌\ni may be missing permission: 'EMBED_LINKS'")
        })

    }
}