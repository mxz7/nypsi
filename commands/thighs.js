const { RichEmbed } = require("discord.js")
const { redditImage } = require("../utils.js")
const snekfetch = require("snekfetch")

const links = ["https://www.reddit.com/r/legs.json?sort=top&t=day",
    "https://www.reddit.com/r/thickthighs.json?sort=top&t=day",
    "https://www.reddit.com/r/perfectthighs.json?sort=top&t=day",
    "https://www.reddit.com/r/thighs.json?sort=top&t=day"]

var cooldown = new Map()

module.exports = {
    name: "thighs",
    description: "get a random thighs image",
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

        const image = await redditImage(chosen, chosen, allowed)

        if (image == "lol") {
            return message.channel.send("❌\nunable to find porn image")
        }

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
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