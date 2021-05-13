const { Guild, Client } = require("discord.js")
const { setPrefix, updateDisabledCommands } = require("../utils/guilds/utils")
const { info, types } = require("../utils/logger")
const { setMuteRole, profileExists } = require("../utils/moderation/utils")

/**
 * @param {Client} client
 * @param {Guild} guild
 */
module.exports = async (client, guild) => {
    if (!guild.name) {
        return console.log(guild)
    }
    info(
        `removed from ${guild.name} (${guild.id}) new count: ${client.guilds.cache.size}`,
        types.GUILD
    )
    setPrefix(guild, "$")
    updateDisabledCommands(guild, [])
    if (profileExists(guild)) {
        setMuteRole(guild, "")
    }
}
