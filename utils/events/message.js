const { Message, MessageEmbed } = require("discord.js")
const { mentions } = require("../../nypsi")
const { getChatFilter, getPrefix, inCooldown } = require("../../guilds/utils")
const { runCommand } = require("../commandhandler")
const { info } = require("../logger")

/**
 * @param {Message} message
 */
module.exports = async (message) => {
    if (message.author.bot) return

    if (!message.guild) {
        info(
            "message in DM from " +
                message.author.tag +
                ": " +
                message.content
        )

        const embed = new MessageEmbed()
            .setTitle("support")
            .setColor("#36393f")
            .setDescription("support server: https://discord.gg/hJTDNST")
        return await message.channel.send(embed)
    }

    if (!message.member.hasPermission("ADMINISTRATOR")) {
        const filter = getChatFilter(message.guild)

        let content = message.content.toLowerCase().normalize("NFD")

        content = content.replace(/[^A-z0-9\s]/g, "")

        content = content.split(" ")

        for (let word of filter) {
            if (content.indexOf(word.toLowerCase()) != -1) {
                return await message.delete()
            }
        }
    }

    const addMention = (m) => {
        if (m.user.bot || m.user.id == message.author.id) {
            return
        }

        let content = message.content

        if (content.length > 100) {
            content = content.substr(0, 97) + "..."
        }

        content = content.replace(/(\r\n|\n|\r)/gm, " ")

        const data = {
            user: message.author.tag,
            content: content,
            date: message.createdTimestamp,
            link: message.url,
        }

        if (!mentions.has(message.guild.id)) {
            mentions.set(message.guild.id, new Map())
        }

        const guildData = mentions.get(message.guild.id)

        if (!guildData.has(m.user.id)) {
            guildData.set(m.user.id, [])
        }

        const userData = guildData.get(m.user.id)

        if (userData.length >= 15) {
            userData.shift()
        }

        userData.push(data)

        guildData.set(m.user.id, userData)
        mentions.set(message.guild.id, guildData)

        exports.mentions = mentions
    }

    if (message.mentions.everyone) {
        let members = message.channel.members

        if (!inCooldown(message.guild)) {
            await message.guild.members.fetch()
        }

        members.forEach((m) => addMention(m))
    } else if (message.mentions.roles.first()) {
        message.mentions.roles.forEach((r) => {
            r.members.forEach((m) => addMention(m))
        })
    } else if (message.mentions.members.first()) {
        message.mentions.members.forEach((m) => addMention(m))
    }

    let prefix = getPrefix(message.guild)

    if (message.client.user.id == "685193083570094101") prefix = "£"

    if (message.content == `<@!${message.client.user.id}>`) {
        return message.channel.send(`my prefix for this server is \`${prefix}\``)
    }

    if (!message.content.startsWith(prefix)) return

    const args = message.content.substring(prefix.length).split(" ")

    const cmd = args[0].toLowerCase()

    return runCommand(cmd, message, args)
}
