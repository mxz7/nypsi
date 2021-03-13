const { GuildChannel } = require("discord.js")

/**
 * @param {GuildChannel} channel
 */
module.exports = (channel) => {
    if (!channel.guild) return
    const muteRole = channel.guild.roles.cache.find(r => r.name.toLowerCase() == "muted")

    if (!muteRole) return

    channel.updateOverwrite(muteRole,{
        SEND_MESSAGES: false,
        SPEAK: false,
        ADD_REACTIONS: false
    }).catch(() => {})
}