const { Guild, Client } = require("discord.js")
const { setPrefix, updateDisabledCommands } = require("../utils/guilds/utils")
const { removeKarma } = require("../utils/karma/utils")
const { logger } = require("../utils/logger")
const { setMuteRole, profileExists } = require("../utils/moderation/utils")

/**
 * @param {Client} client
 * @param {Guild} guild
 */
module.exports = async (client, guild) => {
    if (!guild.name) {
        return
    }
    logger.guild(`removed from ${guild.name} (${guild.id}) new count: ${client.guilds.cache.size}`)
    setPrefix(guild, "$")
    updateDisabledCommands(guild, [])
    if (profileExists(guild)) {
        setMuteRole(guild, "")
    }

    removeKarma(guild.ownerId, Math.floor(guild.memberCount / 10))
}
