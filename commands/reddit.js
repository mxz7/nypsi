const { RichEmbed } = require("discord.js")
const snekfetch = require("snekfetch")
const isImageUrl = require('is-image-url');
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

        const url = "https://www.reddit.com/r/" + args[0] + ".json"

        try {
            const { body } = await snekfetch
                .get(url)
                .query({ limit: 800 })

            allowed = body.data.children.filter(post => !post.data.is_self)

        } catch (e) {
            return message.channel.send("❌\n invalid subreddit")
        }
        

        let chosen = allowed[Math.floor(Math.random() * allowed.length)]

        if (chosen.data.over_18 && !message.channel.nsfw) {
            return message.channel.send("❌\nyou must do this in an nsfw channel")
        }

        let image = chosen.data.url

        let lol = false

        if (image.includes("imgur.com/a/")) {
            chosen = allowed[Math.floor(Math.random() * allowed.length)]
            image = chosen.data.url
        }

        if (image.includes("imgur") && !image.includes("gif")) {
            image = "https://i.imgur.com/" + image.split("/")[3]
            if (!isImageUrl(image)) {
                image = "https://i.imgur.com/" + image.split("/")[3] + ".gif"
            }
        }

        if (image.includes("gfycat")) {

            const link = await fetch("https://api.gfycat.com/v1/gfycats/" + image.split("/")[3]).then(url => url.json())
            
            image = link.gfyItem.max5mbGif
            lol = true
        }

        let count = 0

        while (!isImageUrl(image)) {
            if (lol) {
                break
            }

            if (count >= 10) {
                return message.channel.send("❌\nunable to find image")
            }

            count++

            chosen = allowed[Math.floor(Math.random() * allowed.length)]
            image = chosen.data.url

            if (image.includes("imgur.com/a/")) {
                chosen = allowed[Math.floor(Math.random() * allowed.length)]
                image = chosen.data.url
            }

            if (image.includes("imgur") && !image.includes("gif")) {
                image = "https://i.imgur.com/" + image.split("/")[3]
                if (!isImageUrl(image)) {
                    image = "https://i.imgur.com/" + image.split("/")[3] + ".gif"
                }
            }
    
            if (image.includes("gfycat")) {
    
                const link = await fetch("https://api.gfycat.com/v1/gfycats/" + image.split("/")[3]).then(url => url.json())
    
                image = link.gfyItem.max5mbGif
            }
        }

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const subreddit = args[0]

        const embed = new RichEmbed()
            .setColor(color)
            .setTitle(chosen.data.title)
            .setAuthor("u/" + chosen.data.author + " | r/" + subreddit)
            .setURL(chosen.data.url)
            .setImage(image)
            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌\ni may be missing permission: 'EMBED_LINKS'")
        })

    }
}