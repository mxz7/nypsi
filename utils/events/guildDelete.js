const { Guild, Client } = require("discord.js")
const { setPrefix, updateDisabledCommands } = require("../guilds/utils")
const { info, types } = require("../logger")

/**
 * @param {Client} client
 * @param {Guild} guild
 */
module.exports = async (client, guild) => {
    info(
        "removed from server'" + guild.name + "' new count: " + client.guilds.cache.size,
        types.GUILD
    )
    setPrefix(guild, "$")
    updateDisabledCommands(guild, [])
}
