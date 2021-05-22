const { Message, MessageEmbed, Collection } = require("discord.js")
const { mentions } = require("../nypsi")
const {
    getChatFilter,
    getPrefix,
    inCooldown,
    addCooldown,
    hasGuild,
} = require("../utils/guilds/utils")
const { runCommand } = require("../utils/commandhandler")
const { info } = require("../utils/logger")

/**
 * @type {Array<{ type: String, members: Collection, message: Message, guild: String }>}
 */
const mentionQueue = []
let mentionInterval

/**
 * @param {Message} message
 */
module.exports = async (message) => {
    if (message.author.bot) return

    if (!message.guild) {
        info("message in DM from " + message.author.tag + ": " + message.content)

        const embed = new MessageEmbed()
            .setTitle("support")
            .setColor("#36393f")
            .setDescription("support server: https://discord.gg/hJTDNST")
        return await message.channel.send(embed)
    }

    if (!message.member.hasPermission("ADMINISTRATOR") && hasGuild(message.guild)) {
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

    if (message.guild.memberCount < 50000) {
        if (message.mentions.everyone) {
            let members = message.channel.members

            if (!inCooldown(message.guild)) {
                await message.guild.members.fetch()
                addCooldown(message.guild, 3600)
            }

            mentionQueue.push({
                type: "collection",
                members: members.clone(),
                message: message,
            })

            if (!mentionInterval) {
                mentionInterval = setInterval(() => addMention(), 25)
            }
        } else {
            if (message.mentions.roles.first()) {
                message.mentions.roles.forEach((r) => {
                    mentionQueue.push({
                        type: "collection",
                        members: r.members.clone(),
                        message: message,
                    })
                })

                if (!mentionInterval) {
                    mentionInterval = setInterval(() => addMention(), 25)
                }
            }

            if (message.mentions.members.first()) {
                mentionQueue.push({
                    type: "collection",
                    members: message.mentions.members.clone(),
                    message: message,
                })

                if (!mentionInterval) {
                    mentionInterval = setInterval(() => addMention(), 25)
                }
            }
        }
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

function addMention() {
    const mention = mentionQueue.shift()

    if (mention.type == "collection") {
        const members = mention.members

        let content = mention.message.content

        if (content.length > 100) {
            content = content.substr(0, 97) + "..."
        }

        content = content.replace(/(\r\n|\n|\r)/gm, " ")

        let count = 0

        for (const memberID of Array.from(members.keys())) {
            if (count >= 200) return
            const member = members.get(memberID)

            if (member.user.bot) continue
            if (member.user.id == mention.message.author.id) continue

            const data = {
                user: mention.message.author.tag,
                content: content,
                date: mention.message.createdTimestamp,
                link: mention.message.url,
            }

            const guild = mention.message.guild.id

            mentionQueue.push({
                type: "mention",
                data: data,
                guild: guild,
                target: member.user.id,
            })
            count++
        }
    } else {
        const guild = mention.guild
        const data = mention.data
        const target = mention.target

        if (!mentions.has(guild)) {
            mentions.set(guild, new Map())
        }

        const guildData = mentions.get(guild)

        if (!guildData.has(target)) {
            guildData.set(target, [])
        }

        const userData = guildData.get(target)

        if (userData.length >= 15) {
            userData.shift()
        }

        userData.push(data)

        guildData.set(target, userData)
        mentions.set(guild, guildData)

        exports.mentions = mentions
    }

    if (mentionQueue.length == 0) {
        clearInterval(mentionInterval)
        mentionInterval = undefined
    }
}
