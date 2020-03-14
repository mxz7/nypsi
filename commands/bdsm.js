const { RichEmbed } = require("discord.js")
const { redditImage } = require("../utils.js")
const { bdsmCache } = require("../utils.js")

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

        if (!message.channel.nsfw) {
            return message.channel.send("❌\nyou must do this in an nsfw channel")
        }

        if (bdsmCache.size <= 2) {
            return message.channel.send("❌\nplease wait a couple more seconds..")
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        const bdsmLinks = Array.from(bdsmCache.keys())

        const subredditChoice = bdsmLinks[Math.floor(Math.random() * bdsmLinks.length)]

        const allowed = await bdsmCache.get(subredditChoice)

        const chosen = allowed[Math.floor(Math.random() * allowed.length)]

        const image = await redditImage(chosen, chosen, allowed)

        if (image == "lol") {
            return message.channel.send("❌\nunable to find bdsm image")
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