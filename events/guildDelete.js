const { Guild, Client } = require("discord.js")
const { setPrefix, updateDisabledCommands } = require("../utils/guilds/utils")
const { info, types } = require("../utils/logger")

/**
 * @param {Client} client
 * @param {Guild} guild
 */
module.exports = async (client, guild) => {
    info(
        `removed from ${guild.name} (${guild.id}) new count: ${client.guilds.cache.size}`,
        types.GUILD
    )
    setPrefix(guild, "$")
    updateDisabledCommands(guild, [])
}
