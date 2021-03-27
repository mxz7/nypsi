const { Guild, Client } = require("discord.js")
const { setPrefix, updateDisabledCommands } = require("../../guilds/utils")
const { getTimestamp } = require("../utils")

/**
 * @param {Client} client
 * @param {Guild} guild
 */
module.exports = async (client, guild) => {
    console.log(
        "\x1b[36m[" +
            getTimestamp() +
            "] removed from server '" +
            guild.name +
            "' new count: " +
            client.guilds.cache.size +
            "\x1b[37m"
    )
    setPrefix(guild, "$")
    updateDisabledCommands(guild, [])
}
