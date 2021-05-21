const { Role } = require("discord.js")
const { getMuteRole, setMuteRole, profileExists } = require("../utils/moderation/utils")

/**
 *
 * @param {Role} role
 */
module.exports = (role) => {
    if (!profileExists(role.guild)) return

    if (getMuteRole(role.guild) == role.id) {
        setMuteRole(role.guild, "")
    }
}
