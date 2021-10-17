const { GuildMember } = require("discord.js")
const { isPremium, setTier, renewUser, addMember, getTier, expireUser } = require("../utils/premium/utils")
const { addNewUsername, addNewAvatar, usernameProfileExists, createUsernameProfile } = require("../utils/users/utils")

/**
 * @param {GuildMember} oldMember
 * @param {GuildMember} newMember
 */
module.exports = async (oldMember, newMember) => {
    if (newMember.guild.id == "747056029795221513") {
        if (oldMember.roles.cache.size < newMember.roles.cache.size) {
            let tier = 0

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
            }
        } else if (oldMember.roles.cache.size > newMember.roles.cache.size) {
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
