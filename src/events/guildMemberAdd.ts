import { GuildMember } from "discord.js";
import { createGuild, hasGuild, runCheck } from "../utils/guilds/utils";
import { deleteMute, getMuteRole, isMuted, profileExists } from "../utils/moderation/utils";

const queue = new Set();

export default async function guildMemberAdd(member: GuildMember) {
    if (!(await hasGuild(member.guild))) await createGuild(member.guild);

    if (!queue.has(member.guild.id)) {
        queue.add(member.guild.id);

        setTimeout(async () => {
            await runCheck(member.guild);
            queue.delete(member.guild.id);
        }, 120000);
    }

    if (!(await profileExists(member.guild))) return;

    if ((await getMuteRole(member.guild)) == "timeout") return;

    if (await isMuted(member.guild, member)) {
        let muteRole = await member.guild.roles.fetch(await getMuteRole(member.guild));

        if (!(await getMuteRole(member.guild))) {
            muteRole = await member.guild.roles.cache.find((r) => r.name.toLowerCase() == "muted");
        }

        if (!muteRole) return await deleteMute(member.guild, member);

        member.roles.add(muteRole);
    }
}
