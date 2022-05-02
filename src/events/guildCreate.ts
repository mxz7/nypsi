import { Client, Guild } from "discord.js"
import { createGuild, hasGuild, runCheck } from "../utils/guilds/utils"
import { addKarma } from "../utils/karma/utils"
import { logger } from "../utils/logger"

/**
 * @param {Client} client
 * @param {Guild} guild
 */
module.exports = async (client: Client, guild: Guild) => {
    logger.log({
        level: "guild",
        message: `added to ${guild.name} (${guild.id}) new count: ${client.guilds.cache.size}`,
    })

    if (!hasGuild(guild)) createGuild(guild)

    runCheck(guild)

    addKarma(guild.ownerId, Math.floor(guild.memberCount / 10))
}
