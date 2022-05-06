import { Collection, CommandInteraction, GuildMember, Message } from "discord.js"
import { inPlaceSort } from "fast-sort"
import { daysAgo, formatDate } from "../utils/functions/date"
import { getMember } from "../utils/functions/member"
import { addCooldown, inCooldown } from "../utils/guilds/utils"
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command"
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders"
import workerSort from "../utils/workers/sort"

const cmd = new Command("join", "view your join position in the server", Categories.INFO).setAliases(["joined"])

cmd.slashEnabled = true
cmd.slashData.addUserOption((option) =>
    option.setName("user").setDescription("view join position for this user").setRequired(false)
)

const sortCache = new Map()

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    let member: GuildMember

    if (args.length == 0) {
        member = message.member
    } else {
        if (!message.mentions.members.first()) {
            member = await getMember(message.guild, args[0])
        } else {
            member = message.mentions.members.first()
        }
    }

    const send = async (data) => {
        if (!(message instanceof Message)) {
            if (message.deferred) {
                await message.editReply(data)
            } else {
                await message.reply(data)
            }
            const replyMsg = await message.fetchReply()
            if (replyMsg instanceof Message) {
                return replyMsg
            }
        } else {
            return await message.channel.send(data)
        }
    }

    if (!member) {
        return send({ embeds: [new ErrorEmbed("invalid user")] })
    }

    const joinedServer = formatDate(member.joinedAt).toLowerCase()
    const timeAgo = daysAgo(new Date(member.joinedAt))

    let members: Collection<string, GuildMember>

    if (inCooldown(message.guild) || message.guild.memberCount == message.guild.members.cache.size) {
        members = message.guild.members.cache
    } else {
        members = await message.guild.members.fetch()
        addCooldown(message.guild, 3600)
    }

    let membersSorted: string[] = []

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

        if (membersSorted.length > 500) {
            let msg
            if (message instanceof Message) {
                msg = await send({
                    embeds: [
                        new CustomEmbed(message.member, false, `sorting ${membersSorted.length.toLocaleString()} members..`),
                    ],
                })
            } else {
                await message.deferReply()
            }
            membersSorted = await workerSort(membersSorted, membersMap)
            if (message instanceof Message) {
                await msg.delete()
            }
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

    let joinPos: number | string = membersSorted.indexOf(member.id) + 1

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
