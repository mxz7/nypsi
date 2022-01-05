const { Guild, Client } = require("discord.js")
const { hasGuild, createGuild, runCheck } = require("../utils/guilds/utils")
const { addKarma } = require("../utils/karma/utils")
const { info, types } = require("../utils/logger")

/**
 * @param {Client} client
 * @param {Guild} guild
 */
module.exports = async (client, guild) => {
    info(`added to ${guild.name} (${guild.id}) new count: ${client.guilds.cache.size}`, types.GUILD)

    if (!hasGuild(guild)) createGuild(guild)

    runCheck(guild)

    addKarma(guild.ownerId, Math.floor(guild.memberCount / 10))
}
