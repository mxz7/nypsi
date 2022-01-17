const { Guild, Client } = require("discord.js")
const { hasGuild, createGuild, runCheck } = require("../utils/guilds/utils")
const { addKarma } = require("../utils/karma/utils")
const { logger } = require("../utils/logger")

/**
 * @param {Client} client
 * @param {Guild} guild
 */
module.exports = async (client, guild) => {
    logger.guild(`added to ${guild.name} (${guild.id}) new count: ${client.guilds.cache.size}`)

    if (!hasGuild(guild)) createGuild(guild)

    runCheck(guild)

    addKarma(guild.ownerId, Math.floor(guild.memberCount / 10))
}
