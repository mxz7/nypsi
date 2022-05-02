import { Role } from "discord.js"
import { getMuteRole, profileExists, setMuteRole } from "../utils/moderation/utils"

module.exports = (role: Role) => {
    if (!profileExists(role.guild)) return

    if (getMuteRole(role.guild) == role.id) {
        setMuteRole(role.guild, "")
    }
}
