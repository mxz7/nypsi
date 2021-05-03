const { Role } = require("discord.js")
const { getMuteRole, setMuteRole } = require("../utils/moderation/utils")

/**
 * 
 * @param {Role} role 
 */
module.exports = (role) => {
    if (getMuteRole(role.guild) == role.id) {
        setMuteRole(role.guild, "")
    }
}