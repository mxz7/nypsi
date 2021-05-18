const { eSnipe } = require("../nypsi")
const { hasGuild, createGuild, getSnipeFilter, getChatFilter } = require("../utils/guilds/utils")
const { Message } = require("discord.js")

/**
 * @param {Message} message
 * @param {Message} newMessage
 */
module.exports = async (message, newMessage) => {
    if (!message) return

    if (!message.member) return

    if (!message.member.hasPermission("ADMINISTRATOR")) {
        const filter = getChatFilter(message.guild)

        let content = newMessage.content.toLowerCase().normalize("NFD")

        content = content.replace(/[^A-z0-9\s]/g, "")

        console.log("for4")
        console.time("for4")
        for (let word of filter) {
            if (content.includes(word.toLowerCase())) {
                return await message.delete()
            }
        }
        console.timeEnd("for4")
    }

    if (message.content != "" && !message.member.user.bot && message.content.length > 1) {
        if (!hasGuild(message.guild)) createGuild(message.guild)

        const filter = getSnipeFilter(message.guild)

        let content = message.content.toLowerCase().normalize("NFD")

        content = content.replace(/[^A-z0-9\s]/g, "")

        console.log("for5")
        console.time("for5")
        for (let word of filter) {
            if (content.includes(word.toLowerCase())) return
        }
        console.timeEnd("for5")

        const chatFilter = getChatFilter(message.guild)

        console.log("for6")
        console.time("for6")
        for (let word of chatFilter) {
            if (content.includes(word.toLowerCase())) return
        }
        console.timeEnd("for6")

        eSnipe.set(message.channel.id, {
            content: message.content,
            member: message.author.tag,
            createdTimestamp: message.createdTimestamp,
            channel: {
                id: message.channel.id,
            },
        })

        exports.eSnipe = eSnipe
    }
}
