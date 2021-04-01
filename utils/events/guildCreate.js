const { Guild, Client } = require("discord.js")
const { hasGuild, createGuild } = require("../../guilds/utils")
const { info, types } = require("../logger")

/**
 * @param {Client} client
 * @param {Guild} guild
 */
module.exports = async (client, guild) => {
    info("added to server '" + guild.name + "' new count: " + client.guilds.cache.size, types.GUILD)
    if (!hasGuild(guild)) {
        createGuild(guild)
    }
}
