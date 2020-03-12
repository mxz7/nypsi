const { RichEmbed } = require("discord.js")
const snekfetch = require("snekfetch")
const isImageUrl = require('is-image-url');
const fetch = require("node-fetch")

const links = ["https://www.reddit.com/r/bdsm.json?sort=top&t=day", "https://www.reddit.com/r/bondage.json?sort=top&t=day", "https://www.reddit.com/r/dominated.json?sort=top&t=day"]

var cooldown = new Map()

module.exports = {
    name: "bdsm",
    description: "get a random bdsm image",
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
            return message.channel.send("❌\nstill on cooldown for " + remaining );
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        if (!message.channel.nsfw) {
            return message.channel.send("❌\nyou must do this in an nsfw channel")
        }

        const subredditChoice = links[Math.floor(Math.random() * links.length)]

        const { body } = await snekfetch
            .get(subredditChoice)
            .query({ limit: 800 })
        
        const allowed = body.data.children.filter(post => !post.data.is_self)

        let chosen = allowed[Math.floor(Math.random() * allowed.length)]

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
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
                console.log("couldnt find porn @ " + subredditChoice)
                return message.channel.send("❌\nunable to find porn image")
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

        const subreddit = subredditChoice.split("r/")[1].split(".json")[0]

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