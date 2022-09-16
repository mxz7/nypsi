import { GuildMember } from "discord.js";
import { daysAgo, formatDate } from "../utils/functions/date";
import { NypsiClient } from "../utils/models/Client";
import { CustomEmbed } from "../utils/models/EmbedBuilders";
import { LogType } from "../utils/models/GuildStorage";
import { addLog, isLogsEnabled } from "../utils/moderation/utils";
import { setExpireDate, setTier } from "../utils/premium/utils";
import { fetchUsernameHistory } from "../utils/users/utils";

export default async function guildMemberRemove(member: GuildMember) {
  if (await isLogsEnabled(member.guild)) {
    const embed = new CustomEmbed().disableFooter().setTimestamp();

    embed.setHeader("member left");
    embed.setDescription(
      `${member.toString()} \`${member.id}\`\n\n**tag** ${member.user.tag}\n**joined** ${daysAgo(member.joinedAt)} days ago`
    );

    const history = await fetchUsernameHistory(member);

    if (history.length > 0) {
      const text: string[] = [];

      for (const un of history) {
        if (text.length > 10) break;
        text.push(`\`${un.value}\` | \`${formatDate(un.date)}\``);
      }

      embed.addField("username history", text.join("\n"), true);
    }

    const roles = member.roles.cache;

    let rolesText: string[] = [];

    roles.forEach((role) => {
      if (role.name == "@everyone") return;
      rolesText[role.position] = role.toString();
    });

    rolesText = rolesText.reverse();

    if (roles.size > 1) {
      embed.addField(`roles [${roles.size - 1}]`, rolesText.join(" "), true);
    }

    await addLog(member.guild, LogType.MEMBER, embed);
  }

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
