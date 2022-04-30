const { Message } = require("discord.js")
const { Command, categories } = require("../utils/models/Command")
const { getMember, formatDate, daysAgo } = require("../utils/utils")
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders.js")
const { inCooldown, addCooldown } = require("../utils/guilds/utils")
const workerSort = require("../utils/workers/sort")
const { inPlaceSort } = require("fast-sort")

const cmd = new Command("join", "view your join position in the server", categories.INFO).setAliases(["joined"])

cmd.slashEnabled = true
cmd.slashData.addUserOption((option) =>
    option.setName("user").setDescription("view join position for this user").setRequired(false)
)

const sortCache = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let member

    if (args.length == 0) {
        member = message.member
    } else {
        if (!message.mentions.members.first()) {
            member = await getMember(message, args[0])
        } else {
            member = message.mentions.members.first()
        }
    }

    const send = async (data) => {
        if (message.interaction) {
            await message.reply(data)
            return await message.fetchReply()
        } else {
            return await message.channel.send(data)
        }
    }

    if (!member) {
        return send({ embeds: [new ErrorEmbed("invalid user")] })
    }

    const joinedServer = formatDate(member.joinedAt).toLowerCase()
    const timeAgo = daysAgo(new Date(member.joinedAt))

    let members

    if (inCooldown(message.guild) || message.guild.memberCount == message.guild.members.cache.size) {
        members = message.guild.members.cache
    } else {
        members = await message.guild.members.fetch()
        addCooldown(message.guild, 3600)
    }

    let membersSorted = []

    if (sortCache.has(message.guild.id) && sortCache.get(message.guild.id).length == message.guild.memberCount) {
        membersSorted = sortCache.get(message.guild.id)
    } else if (message.guild.memberCount < 69420) {
        const membersMap = new Map()

        members.forEach((m) => {
            if (m.joinedTimestamp) {
                membersSorted.push(m.id)
                membersMap.set(m.id, m.joinedAt)
            }
        })

        if (membersSorted.length > 1000) {
            const msg = await send({
                embeds: [
                    new CustomEmbed(message.member, false, `sorting ${membersSorted.length.toLocaleString()} members..`),
                ],
            })
            membersSorted = await workerSort(membersSorted, membersMap)
            await msg.delete()
        } else {
            inPlaceSort(membersSorted).asc((i) => membersMap.get(i))
        }

        sortCache.set(message.guild.id, membersSorted)

        setTimeout(() => {
            try {
                sortCache.delete(message.guild.id)
            } catch {
                sortCache.clear()
            }
        }, 60000 * 10)
    }

    let joinPos = membersSorted.indexOf(member.id) + 1

    if (joinPos == 0) joinPos = "invalid"

    const embed = new CustomEmbed(
        message.member,
        false,
        `joined on **${joinedServer}**\n - **${timeAgo.toLocaleString()}** days ago\njoin position is **${
            joinPos != "invalid" ? joinPos.toLocaleString() : "--"
        }**`
    )
        .setTitle(member.user.tag)
        .setThumbnail(member.user.displayAvatarURL({ format: "png", dynamic: true, size: 128 }))

    return send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
