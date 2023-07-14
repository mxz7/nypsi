import { GuildMember } from "discord.js";
import { CustomEmbed } from "../models/EmbedBuilders";
import { daysAgo, formatDate } from "../utils/functions/date";
import {
  getAutoJoinRoles,
  getPersistentRoles,
  getPersistentRolesForUser,
  setAutoJoinRoles,
  setPersistentRoles,
} from "../utils/functions/guilds/roles";
import { createGuild, hasGuild, runCheck } from "../utils/functions/guilds/utils";
import { addLog, isLogsEnabled } from "../utils/functions/moderation/logs";
import { deleteMute, getMuteRole, isMuted } from "../utils/functions/moderation/mute";
import { profileExists } from "../utils/functions/moderation/utils";
import sleep from "../utils/functions/sleep";
import { fetchUsernameHistory } from "../utils/functions/users/history";
import { logger } from "../utils/logger";

const queue = new Set<string>();

export default async function guildMemberAdd(member: GuildMember) {
  if (!(await hasGuild(member.guild))) await createGuild(member.guild);

  if (await isLogsEnabled(member.guild)) {
    const embed = new CustomEmbed().disableFooter().setTimestamp();

    embed.setHeader(member.user.username, member.user.avatarURL());
    embed.setTitle("member joined");
    embed.setDescription(
      `${member.toString()} \`${member.id}\`\n\n**username** ${
        member.user.username
      }\n**created** ${daysAgo(member.user.createdAt)} days ago`,
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

    await addLog(member.guild, "member", embed);
  }

  const autoRoles = await getAutoJoinRoles(member.guild);

  if (autoRoles.length > 0) {
    for (const roleId of autoRoles) {
      await member.roles.add(roleId).catch(async () => {
        autoRoles.splice(autoRoles.indexOf(roleId), 1);
        await setAutoJoinRoles(member.guild, autoRoles);
      });
      await sleep(500);
    }

    logger.info(`autojoin roles given to ${member.id} in ${member.guild.id}`);
  }

  const [persistentRoles, userRoles] = await Promise.all([
    getPersistentRoles(member.guild),
    getPersistentRolesForUser(member.guild, member.id),
  ]);

  if (userRoles.length > 0 && persistentRoles.length > 0) {
    let count = 0;
    for (const roleId of userRoles) {
      if (persistentRoles.includes(roleId)) {
        count++;
        await member.roles.add(roleId).catch(async () => {
          persistentRoles.splice(persistentRoles.indexOf(roleId));
          await setPersistentRoles(member.guild, persistentRoles);
        });
        await sleep(500);
      }
    }
    if (count > 0)
      logger.info(`${count} persistent roles given to ${member.id} in ${member.guild.id}`);
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
