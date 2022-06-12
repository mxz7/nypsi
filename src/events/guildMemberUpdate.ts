import { GuildMember } from "discord.js"
import { addKarma } from "../utils/karma/utils"
import { addMember, expireUser, getTier, isPremium, renewUser, setTier } from "../utils/premium/utils"

/**
 * @param {GuildMember} oldMember
 * @param {GuildMember} newMember
 */
export default async function guildMemberUpdate(oldMember: GuildMember, newMember: GuildMember) {
    if (newMember.guild.id == "747056029795221513") {
        if (oldMember.roles.cache.size < newMember.roles.cache.size) {
            let tier = 0

            // 747066190530347089 boost role
            // 819870727834566696 silver role
            // 819870846536646666 gold role
            // 819870959325413387 platinum role

            if (newMember.roles.cache.find((r) => r.id == "819870959325413387")) {
                // platinum
                tier = 4
            } else if (newMember.roles.cache.find((r) => r.id == "819870846536646666")) {
                // gold
                tier = 3
            } else if (newMember.roles.cache.find((r) => r.id == "747066190530347089")) {
                // boost
                tier = 2
            } else if (newMember.roles.cache.find((r) => r.id == "819870727834566696")) {
                // silver
                tier = 2
            } else if (newMember.roles.cache.find((r) => r.id == "819870590718181391")) {
                // bronze
                tier = 1
            }

            if (tier == 0 || tier > 4) return

            if (isPremium(newMember.user.id)) {
                if (tier <= getTier(newMember.user.id)) return

                setTier(newMember.user.id, tier)
                renewUser(newMember.user.id)
            } else {
                addMember(newMember.user.id, tier)
                await addKarma(newMember.user.id, 50)
            }
        } else if (oldMember.roles.cache.size > newMember.roles.cache.size) {
            // 747066190530347089 boost role
            // 819870727834566696 silver role
            // 819870846536646666 gold role
            // 819870959325413387 platinum role
            if (
                oldMember.roles.cache.find((r) => r.id == "747066190530347089") &&
                !newMember.roles.cache.find((r) => r.id == "747066190530347089")
            ) {
                if (newMember.roles.cache.find((r) => r.id == "819870959325413387")) return
                if (newMember.roles.cache.find((r) => r.id == "819870846536646666")) return
                if (newMember.roles.cache.find((r) => r.id == "819870727834566696")) expireUser(newMember.id)
            }
        }
    }
}
