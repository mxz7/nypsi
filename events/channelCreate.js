const { GuildChannel } = require("discord.js")
const { getMuteRole } = require("../utils/moderation/utils")

/**
 * @param {GuildChannel} channel
 */
module.exports = (channel) => {
    if (!channel.guild) return

    let muteRole = channel.guild.roles.fetch(getMuteRole(channel.guild))

    if (getMuteRole(channel.guild) == "") {
        muteRole = channel.guild.roles.cache.find((r) => r.name.toLowerCase() == "muted")
    }

    if (!muteRole) return

    channel
        .updateOverwrite(muteRole, {
            SEND_MESSAGES: false,
            SPEAK: false,
            ADD_REACTIONS: false,
        })
        .catch(() => {})
}
