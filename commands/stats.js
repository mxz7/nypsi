const { MessageEmbed } = require("discord.js")
const { getColor } = require("../utils.js")
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
            return message.channel.send("❌\nstill on cooldown for " + remaining );
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        const { commandsSize, aliasesSize } = require("../nypsi.js")
        const color = getColor(message.member);
        const uptime = getUptime(message.client.uptime)
        const memUsage = Math.round(process.memoryUsage().rss / 1024 / 1024)
        const { bdsmCache, thighsCache, pornCache, assCache } = require("../utils.js")
        let nsfwCache = 0

        for (link of Array.from(bdsmCache.keys())) {
            nsfwCache = nsfwCache + bdsmCache.get(link).length
        }
        for (link of Array.from(assCache.keys())) {
            nsfwCache = nsfwCache + assCache.get(link).length
        }
        for (link of Array.from(thighsCache.keys())) {
            nsfwCache = nsfwCache + thighsCache.get(link).length
        }
        for (link of Array.from(pornCache.keys())) {
            nsfwCache = nsfwCache + pornCache.get(link).length
        }

        const embed = new MessageEmbed()
            .setTitle("stats")
            .setColor(color)
            .addField("bot", "**server count** " + message.client.guilds.cache.size.toLocaleString() + "\n" +
                "**user count** " + message.client.users.cache.size.toLocaleString() + "\n" +
                "**total commands** " + commandsSize + "\n" +
                "**command aliases** " + aliasesSize + "\n" +
                "**uptime** " + uptime, true)
            .addField("cache", "**users (econ)** " + getUserCount().toLocaleString() + "\n" +
                " -- **this server** " + getUserCountGuild(message.guild) + "\n" +
                "**vote** " + getVoteCacheSize().toLocaleString() + "\n" +
                "**nsfw imgs** " + nsfwCache.toLocaleString(), true)
            .addField("usage", "**memory** " + memUsage + "mb", true)
            .setFooter("bot.tekoh.wtf")

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌\n i may be lacking permission: 'EMBED_LINKS'")
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