const { snipe } = require("../nypsi")
const { hasGuild, createGuild, getSnipeFilter, getChatFilter } = require("../utils/guilds/utils")
const { Message } = require("discord.js")

/**
 * @param {Message} message
 */
module.exports = (message) => {
    if (!message) return

    if (!message.member) return

    if (message.content != "" && !message.member.user.bot && message.content.length > 1) {
        if (!hasGuild(message.guild)) createGuild(message.guild)

        const filter = getSnipeFilter(message.guild)

        let content = message.content.toLowerCase().normalize("NFD")

        content = content.replace(/[^A-z0-9\s]/g, "")

        for (let word of filter) {
            if (content.includes(word.toLowerCase())) return
        }

        const chatFilter = getChatFilter(message.guild)

        for (let word of chatFilter) {
            if (content.includes(word.toLowerCase())) return
        }

        snipe.set(message.channel.id, {
            content: message.content,
            member: message.author.tag,
            createdTimestamp: message.createdTimestamp,
            channel: {
                id: message.channel.id,
            },
        })

        exports.snipe = snipe
    }
}
