import { GuildMember } from "discord.js";
import prisma from "../init/database";
import { NypsiClient } from "../models/Client";
import { CustomEmbed } from "../models/EmbedBuilders";
import { daysAgo, formatDate } from "../utils/functions/date";
import { getPersistantRoles } from "../utils/functions/guilds/roles";
import { addLog, isLogsEnabled } from "../utils/functions/moderation/logs";
import { setExpireDate, setTier } from "../utils/functions/premium/premium";
import { fetchUsernameHistory } from "../utils/functions/users/history";

export default async function guildMemberRemove(member: GuildMember) {
  if (await isLogsEnabled(member.guild)) {
    const embed = new CustomEmbed().disableFooter().setTimestamp();

    embed.setHeader(member.user.tag, member.user.avatarURL());
    embed.setTitle("member left");
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

    await addLog(member.guild, "member", embed);
  }

  if (member.roles.cache.size > 0 && (await getPersistantRoles(member.guild)).length > 0) {
    await prisma.rolePersist.upsert({
      where: {
        guildId_userId: {
          guildId: member.guild.id,
          userId: member.id,
        },
      },
      create: {
        userId: member.id,
        guildId: member.guild.id,
        roles: Array.from(member.roles.cache.values()).map((r) => r.id),
      },
      update: {
        roles: Array.from(member.roles.cache.values()).map((r) => r.id),
      },
    });
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
