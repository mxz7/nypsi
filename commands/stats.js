const { MessageEmbed } = require("discord.js")
const { getColor } = require("../utils/utils")
const { getUserCount, getUserCountGuild, getVoteCacheSize } = require("../economy/utils.js")

const cooldown = new Map()

module.exports = {
    name: "stats",
    description: "view stats for the bot",
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
            return message.channel.send("❌ still on cooldown for " + remaining );
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        const { commandsSize, aliasesSize } = require("../utils/commandhandler")
        const { snipe, eSnipe } = require("../nypsi.js")
        const snipedMessages = snipe.size + eSnipe.size
        const color = getColor(message.member);
        const uptime = getUptime(message.client.uptime)
        const memUsage = Math.round(process.memoryUsage().rss / 1024 / 1024)
        const { bdsmCache, thighsCache, pornCache, assCache, birbCache, catCache, dogCache, rabbitCache, snekCache } = require("../utils/imghandler")
        let imgCache = 0

        for (link of Array.from(bdsmCache.keys())) {
            imgCache = imgCache + bdsmCache.get(link).length
        }
        for (link of Array.from(assCache.keys())) {
            imgCache = imgCache + assCache.get(link).length
        }
        for (link of Array.from(thighsCache.keys())) {
            imgCache = imgCache + thighsCache.get(link).length
        }
        for (link of Array.from(pornCache.keys())) {
            imgCache = imgCache + pornCache.get(link).length
        }
        for (link of Array.from(birbCache.keys())) {
            imgCache = imgCache + birbCache.get(link).length
        }
        for (link of Array.from(catCache.keys())) {
            imgCache = imgCache + catCache.get(link).length
        }
        for (link of Array.from(dogCache.keys())) {
            imgCache = imgCache + dogCache.get(link).length
        }
        for (link of Array.from(rabbitCache.keys())) {
            imgCache = imgCache + rabbitCache.get(link).length
        }
        for (link of Array.from(snekCache.keys())) {
            imgCache = imgCache + snekCache.get(link).length
        }

        const embed = new MessageEmbed()
            .setTitle("stats")
            .setColor(color)
            .addField("bot", "**server count** " + message.client.guilds.cache.size.toLocaleString() + "\n" +
                "**user count** " + message.client.users.cache.size.toLocaleString() + "\n" +
                "**total commands** " + commandsSize + "\n" +
                "**total aliases** " + aliasesSize + "\n" +
                "**uptime** " + uptime, true)
            .addField("cache", "**users (econ)** " + getUserCount().toLocaleString() + "\n" +
                " -- **this server** " + getUserCountGuild(message.guild) + "\n" +
                "**vote** " + getVoteCacheSize().toLocaleString() + "\n" +
                "**snipe** " + snipedMessages.toLocaleString() + "\n" +
                "**imgs** " + imgCache.toLocaleString(), true)
            .addField("usage", "**memory** " + memUsage + "mb", true)
            .setFooter("bot.tekoh.wtf")

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌  i may be lacking permission: 'EMBED_LINKS'")
        })
    }
}

function getUptime(ms) {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000))
    const daysms = ms % (24 * 60 * 60 * 1000)
    const hours = Math.floor((daysms) / (60*60*1000))
    const hoursms = ms % (60 * 60 * 1000)
    const minutes = Math.floor((hoursms) / (60 * 1000))
    const minutesms = ms % (60 * 1000)
    const sec = Math.floor((minutesms) / (1000))

    let output = ""

    if (days > 0) {
        output = output + days + "d "
    }

    if (hours > 0) {
        output = output + hours + "h "
    }

    if (minutes > 0) {
        output = output + minutes + "m "
    }

    if (sec > 0) {
        output = output + sec + "s"
    }

    return output
}