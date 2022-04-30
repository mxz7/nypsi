const { GuildChannel } = require("discord.js")
const { getMuteRole, profileExists } = require("../utils/moderation/utils")

/**
 * @param {GuildChannel} channel
 */
module.exports = async (channel) => {
    if (!channel.guild) return

    if (!profileExists(channel.guild)) return

    let muteRole = await channel.guild.roles.fetch(getMuteRole(channel.guild))

    if (!getMuteRole(channel.guild)) {
        muteRole = await channel.guild.roles.cache.find((r) => r.name.toLowerCase() == "muted")
    }

    if (!muteRole) return

    channel.permissionOverwrites
        .edit(muteRole, {
            SEND_MESSAGES: false,
            SPEAK: false,
            ADD_REACTIONS: false,
        })
        .catch(() => {})
}
