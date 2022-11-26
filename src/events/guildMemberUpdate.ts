import { GuildMember, Role } from "discord.js";
import { CustomEmbed } from "../models/EmbedBuilders";
import { LogType } from "../types/Moderation";
import { addLog, isLogsEnabled } from "../utils/functions/moderation/logs";

export default async function guildMemberUpdate(oldMember: GuildMember, newMember: GuildMember) {
  if (oldMember.roles.cache.size != newMember.roles.cache.size && (await isLogsEnabled(newMember.guild))) {
    let roles: Role[];

    const oldIds = Array.from(oldMember.roles.cache.keys());
    const newIds = Array.from(newMember.roles.cache.keys());

    if (oldIds.length > newIds.length) {
      roles = oldIds.filter((a) => !newIds.includes(a)).map((id) => oldMember.roles.cache.get(id));
    } else {
      roles = newIds.filter((a) => !oldIds.includes(a)).map((id) => newMember.roles.cache.get(id));
    }

    if (roles.length == 0) return;

    const embed = new CustomEmbed().disableFooter().setTimestamp();

    embed.setHeader(oldIds.length > newIds.length ? "role removed" : "role added");
    embed.setDescription(`${newMember.user.toString()} \`${newMember.user.id}\``);
    embed.addField(`role${roles.length > 1 ? "s" : ""}`, roles.map((r) => r.toString()).join("\n"));

    await addLog(newMember.guild, LogType.MEMBER, embed);
  }
}
