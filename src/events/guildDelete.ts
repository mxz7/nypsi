import { Client, Guild } from "discord.js"
import { setPrefix, updateDisabledCommands } from "../utils/guilds/utils"
import { removeKarma } from "../utils/karma/utils"
import { logger } from "../utils/logger"
import { profileExists, setMuteRole } from "../utils/moderation/utils"

/**
 * @param {Client} client
 * @param {Guild} guild
 */
module.exports = async (client: Client, guild: Guild) => {
    if (!guild.name) {
        return
    }

    logger.log({
        level: "guild",
        message: `removed from ${guild.name} (${guild.id}) new count: ${client.guilds.cache.size}`,
    })

    setPrefix(guild, "$")
    updateDisabledCommands(guild, [])
    if (profileExists(guild)) {
        setMuteRole(guild, "")
    }

    removeKarma(guild.ownerId, Math.floor(guild.memberCount / 10))
}
