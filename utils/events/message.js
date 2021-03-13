const { Message, MessageEmbed } = require("discord.js")
const { mentions } = require("../../nypsi")
const { getChatFilter, getPrefix } = require("../../guilds/utils")
const { runCommand } = require("../commandhandler")
const { getTimestamp } = require("../utils")

/**
 * @param {Message} message
 */
module.exports = async (message) => {
    if (message.author.bot) return

    if (!message.guild) {
        console.log("\x1b[33m[" + getTimestamp() + "] message in DM from " + message.author.tag + ": '" + message.content + "'\x1b[37m")

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
    
        for (let word of filter) {
            if (content.includes(word.toLowerCase())) {
                return await message.delete()
            }
        }
    }

    if (message.mentions.members.first()) {
        message.mentions.members.forEach(m => {
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
                link: message.url
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
        })
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