import { GuildMember } from "discord.js"
import { createGuild, hasGuild, runCheck } from "../utils/guilds/utils"
import { deleteMute, getMuteRole, isMuted, profileExists } from "../utils/moderation/utils"

const queue = new Set()

/**
 * @param {GuildMember} member
 */
export default async function guildMemberAdd(member: GuildMember) {
    if (!hasGuild(member.guild)) createGuild(member.guild)

    if (!queue.has(member.guild.id)) {
        queue.add(member.guild.id)

        setTimeout(() => {
            runCheck(member.guild)
            queue.delete(member.guild.id)
        }, 120000)
    }

    if (!profileExists(member.guild)) return

    if (isMuted(member.guild, member)) {
        let muteRole = await member.guild.roles.fetch(getMuteRole(member.guild))

        if (!getMuteRole(member.guild)) {
            muteRole = await member.guild.roles.cache.find((r) => r.name.toLowerCase() == "muted")
        }

        if (!muteRole) return deleteMute(member.guild, member)

        member.roles.add(muteRole)
    }
}
