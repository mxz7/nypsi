import { GuildMember } from "discord.js";
import { NypsiClient } from "../utils/models/Client";
import { setExpireDate, setTier } from "../utils/premium/utils";

export default async function guildMemberRemove(member: GuildMember) {
    if (member.guild.id != "747056029795221513") return;

    if (member.roles.cache.has("747066190530347089")) {
        if (member.roles.cache.has("819870959325413387") || member.roles.cache.has("819870846536646666")) {
            return;
        } else if (member.roles.cache.has("819870727834566696")) {
            await setTier(member.user.id, 2, member.client as NypsiClient);
        } else if (member.roles.cache.has("819870590718181391")) {
            await setTier(member.user.id, 1, member.client as NypsiClient);
        } else {
            setExpireDate(member.user.id, new Date(0), member.client as NypsiClient);
        }
    }
}
