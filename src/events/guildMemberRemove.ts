import { GuildMember } from "discord.js"
import { expireUser, setTier } from "../utils/premium/utils"

/**
 *
 * @param {GuildMember} member
 */
module.exports = async (member: GuildMember) => {
    if (member.guild.id != "747056029795221513") return

    if (member.roles.cache.has("747066190530347089")) {
        if (member.roles.cache.has("819870959325413387") || member.roles.cache.has("819870846536646666")) {
            return
        } else if (member.roles.cache.has("819870727834566696")) {
            setTier(member.user.id, 2)
        } else if (member.roles.cache.has("819870590718181391")) {
            setTier(member.user.id, 1)
        } else {
            expireUser(member.user.id)
        }
    }
}
