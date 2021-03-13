const { GuildMember } = require("discord.js")
const { isPremium, setTier, renewUser, addMember, getTier } = require("../../premium/utils")

/**
 * @param {GuildMember} oldMember
 * @param {GuildMember} newMember 
 */
module.exports = async (oldMember, newMember) => {
    if (newMember.guild.id == "747056029795221513") {
        if (oldMember.roles.cache.size < newMember.roles.cache.size) {

            let tier = 0

            if (newMember.roles.cache.find(r => r.id == "819870959325413387")) { // platinum 
                tier = 4
            } else if (newMember.roles.cache.find(r => r.id == "819870846536646666")) { // gold 
                tier = 3
            } else if (newMember.roles.cache.find(r => r.id == "819870727834566696")) { // silver
                tier = 2
            } else if (newMember.roles.cache.find(r => r.id == "819870590718181391")) { // bronze
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
        }
    }
}