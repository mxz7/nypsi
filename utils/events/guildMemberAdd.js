const { GuildMember } = require("discord.js")
const { runCheck } = require("../../guilds/utils")
const { profileExists, isMuted, deleteMute } = require("../../moderation/utils")

/**
 * @param {GuildMember} member
 */
module.exports = (member) => {
    runCheck(member.guild)

    if (!profileExists(member.guild)) return

    if (isMuted(member.guild, member)) {
        const muteRole = member.guild.roles.cache.find(r => r.name.toLowerCase() == "muted")

        if (!muteRole) return deleteMute(member.guild, member)

        member.roles.add(muteRole)
    }
}