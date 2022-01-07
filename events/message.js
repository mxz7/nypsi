const { Message, MessageEmbed, Collection, Permissions } = require("discord.js")
const { getChatFilter, getPrefix, inCooldown, addCooldown, hasGuild } = require("../utils/guilds/utils")
const { runCommand } = require("../utils/commandhandler")
const { info } = require("../utils/logger")
const { getDatabase } = require("../utils/database/database")
const { isPremium, getTier } = require("../utils/premium/utils")

/**
 * @type {Array<{ type: String, members: Collection, message: Message, guild: String }>}
 */
const mentionQueue = []
const db = getDatabase()
const addMentionToDatabase = db.prepare(
    "INSERT INTO mentions (guild_id, target_id, date, user_tag, url, content) VALUES (?, ?, ?, ?, ?, ?)"
)
const fetchMentions = db.prepare("SELECT mention_id FROM mentions WHERE guild_id = ? AND target_id = ? ORDER BY date DESC")
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
        return await message.channel.send({ embeds: [embed] })
    }

    if (hasGuild(message.guild)) {
        const filter = getChatFilter(message.guild)

        let content = message.content.toLowerCase().normalize("NFD")

        content = content.replace(/[^A-z0-9\s]/g, "")

        content = content.split(" ")

        for (let word of filter) {
            if (content.indexOf(word.toLowerCase()) != -1) {
                if (!message.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) return await message.delete()
            }
        }
    }

    if (message.guild.memberCount < 250000) {
        if (message.mentions.everyone) {
            if (!inCooldown(message.guild) && message.guild.members.cache != message.guild.memberCount) {
                await message.guild.members.fetch()
                addCooldown(message.guild, 3600)
            }

            let members = message.channel.members

            mentionQueue.push({
                type: "collection",
                members: members.clone(),
                message: message,
            })

            if (!mentionInterval) {
                mentionInterval = setInterval(() => addMention(), 100)
            }
        } else {
            if (message.mentions.roles.first()) {
                if (!inCooldown(message.guild) && message.guild.members.cache != message.guild.memberCount) {
                    await message.guild.members.fetch()
                    addCooldown(message.guild, 3600)
                }

                message.mentions.roles.forEach((r) => {
                    mentionQueue.push({
                        type: "collection",
                        members: r.members.clone(),
                        message: message,
                    })
                })

                if (!mentionInterval) {
                    mentionInterval = setInterval(() => addMention(), 100)
                }
            }

            if (message.mentions.members.first()) {
                mentionQueue.push({
                    type: "collection",
                    members: message.mentions.members.clone(),
                    message: message,
                })

                if (!mentionInterval) {
                    mentionInterval = setInterval(() => addMention(), 100)
                }
            }
        }
    }

    let prefix = getPrefix(message.guild)

    if (message.client.user.id == "685193083570094101") prefix = "£"

    if (message.content == `<@!${message.client.user.id}>`) {
        return message.channel.send({ content: `my prefix for this server is \`${prefix}\`` })
    }

    if (!message.content.startsWith(prefix)) return

    const args = message.content.substring(prefix.length).split(" ")

    const cmd = args[0].toLowerCase()

    return runCommand(cmd, message, args)
}

function addMention() {
    const mention = mentionQueue.shift()

    if (!mention) {
        clearInterval(mentionInterval)
        mentionInterval = undefined
        return
    }

    if (mention.type == "collection") {
        const members = mention.members

        let content = mention.message.content

        if (content.length > 100) {
            content = content.substr(0, 97) + "..."
        }

        content = content.replace(/(\r\n|\n|\r)/gm, " ")

        let count = 0

        let channelMembers

        try {
            channelMembers = mention.message.channel.members
        } catch {
            return
        }

        for (const memberID of Array.from(members.keys())) {
            if (count >= 150) {
                return mentionQueue.push({
                    type: "collection",
                    members: members.clone(),
                    message: mention.message,
                })
            }
            const member = members.get(memberID)

            members.delete(memberID)

            if (member.user.bot) continue
            if (member.user.id == mention.message.author.id) continue

            try {
                if (!channelMembers.has(memberID)) continue
            } catch {
                channelMembers = channelMembers.cache
                if (!channelMembers.has(memberID)) continue
            }

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

        addMentionToDatabase.run(guild, target, Math.floor(data.date / 1000), data.user, data.link, data.content)

        const mentions = fetchMentions.run(guild, target)

        let limit = 10

        if (isPremium(target)) {
            const tier = getTier(target)

            limit += tier * 2
        }

        if (mentions.length > limit) {
            mentions.splice(0, limit)

            const deleteMention = db.prepare("DELETE FROM mentions WHERE mention_id = ?")

            for (const mention of mentions) {
                deleteMention.run(mention.mention_id)
            }
        }
    }

    if (mentionQueue.length == 0) {
        clearInterval(mentionInterval)
        mentionInterval = undefined
        cleanMentions()
    }
}

function cleanMentions() {
    const limit = Math.floor((Date.now() - 86400000) / 1000)

    const { changes } = db.prepare("DELETE FROM mentions WHERE date < ?").run(limit)

    if (changes > 0) info(`${changes} mentions deleted`)
}
