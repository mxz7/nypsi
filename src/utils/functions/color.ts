import { GuildMember } from "discord.js"

export function getColor(member: GuildMember) {
    if (member.displayHexColor == "#ffffff") {
        return "#111111"
    } else {
        return member.displayHexColor
    }
}
