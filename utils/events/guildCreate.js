const { Guild, Client } = require("discord.js")
const { hasGuild, createGuild } = require("../../guilds/utils")
const { getTimestamp } = require("../utils")

/**
 * @param {Client} client
 * @param {Guild} guild
 */
module.exports = async (client, guild) => {
    console.log("\x1b[36m[" + getTimestamp() + "] joined new server '" + guild.name + "' new count: " + client.guilds.cache.size + "\x1b[37m")
    if (!hasGuild(guild)) {
        createGuild(guild)
    }
}