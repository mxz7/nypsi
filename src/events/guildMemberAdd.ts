import { GuildMember } from "discord.js";
import { CustomEmbed } from "../models/EmbedBuilders";
import { LogType } from "../types/Moderation";
import { daysAgo, formatDate } from "../utils/functions/date";
import { createGuild, hasGuild, runCheck } from "../utils/functions/guilds/utils";
import { addLog, isLogsEnabled } from "../utils/functions/moderation/logs";
import { deleteMute, getMuteRole, isMuted } from "../utils/functions/moderation/mute";
import { profileExists } from "../utils/functions/moderation/utils";
import { fetchUsernameHistory } from "../utils/functions/users/history";

const queue = new Set<string>();

export default async function guildMemberAdd(member: GuildMember) {
  if (!(await hasGuild(member.guild))) await createGuild(member.guild);

  if (await isLogsEnabled(member.guild)) {
    const embed = new CustomEmbed().disableFooter().setTimestamp();

    embed.setHeader("member joined");
    embed.setDescription(
      `${member.toString()} \`${member.id}\`\n\n**tag** ${member.user.tag}\n**created** ${daysAgo(
        member.user.createdAt
      )} days ago`
    );

    const history = await fetchUsernameHistory(member);

    if (history.length > 0) {
      const text: string[] = [];

      for (const un of history) {
        if (text.length > 10) break;
        text.push(`\`${un.value}\` | \`${formatDate(un.date)}\``);
      }

      embed.addField("username history", text.join("\n"));
    }

    await addLog(member.guild, LogType.MEMBER, embed);
  }

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
