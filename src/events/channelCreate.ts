import { GuildChannel } from "discord.js"
import { getMuteRole, profileExists } from "../utils/moderation/utils"

export default async function channelCreate(channel: GuildChannel) {
    if (!channel.guild) return

    if (!profileExists(channel.guild)) return

    if (getMuteRole(channel.guild) == "timeout") return

    let muteRole = await channel.guild.roles.fetch(getMuteRole(channel.guild))

    if (!getMuteRole(channel.guild)) {
        muteRole = channel.guild.roles.cache.find((r) => r.name.toLowerCase() == "muted")
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
