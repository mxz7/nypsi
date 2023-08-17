import { GuildMember } from "discord.js";
import redis from "../init/redis";
import { CustomEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
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
import { deleteMute, getMuteRole, isMuted, newMute } from "../utils/functions/moderation/mute";
import { profileExists } from "../utils/functions/moderation/utils";
import sleep from "../utils/functions/sleep";
import { fetchUsernameHistory } from "../utils/functions/users/history";
import { logger } from "../utils/logger";
import { isAltPunish } from "../utils/functions/guilds/altpunish";
import { getMainAccount, isAlt } from "../utils/functions/moderation/alts";
import prisma from "../init/database";
import { newCase } from "../utils/functions/moderation/cases";
import { isBanned, newBan } from "../utils/functions/moderation/ban";

const queue = new Set<string>();

export default async function guildMemberAdd(member: GuildMember) {
  if (!(await hasGuild(member.guild))) await createGuild(member.guild);

  await redis.del(`${Constants.redis.cache.guild.JOIN_ORDER}:${member.guild.id}`);

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

  if (
    (await isAltPunish(member.guild)) &&
    (await isAlt(member.guild, member.user.id)) &&
    (await isBanned(member.guild, await getMainAccount(member.guild, member.user.id)))
  ) {
    const mainId = await getMainAccount(member.guild, member.user.id);
    const query = await prisma.moderationBan.findMany({
      where: {
        guildId: member.guild.id,
        userId: mainId,
      },
      select: {
        expire: true,
      },
    });

    if (query.length != 1) return;

    const expire = query[0].expire;

    await newCase(
      member.guild,
      "ban",
      member.user.id,
      member.guild.members.me.user,
      `alt of banned \`${mainId}\` joined`,
    );

    await newBan(member.guild, [member.user.id], expire);

    await member.ban({ reason: `alt of banned ${mainId} joined` }).catch(() => {});
    return;
  }

  if ((await getMuteRole(member.guild)) == "timeout") return;

  let altPunish = false;

  if (
    (await isAltPunish(member.guild)) &&
    (await isAlt(member.guild, member.user.id)) &&
    (await isMuted(member.guild, await getMainAccount(member.guild, member.user.id)))
  ) {
    const mainId = await getMainAccount(member.guild, member.user.id);
    const query = await prisma.moderationMute.findMany({
      where: {
        guildId: member.guild.id,
        userId: mainId,
      },
      select: {
        expire: true,
      },
    });

    if (query.length != 1) return;

    const expire = query[0].expire;

    await newCase(
      member.guild,
      "mute",
      member.user.id,
      member.guild.members.me.user,
      `alt of muted \`${mainId}\` joined`,
    );

    if (await isMuted(member.guild, member)) {
      await deleteMute(member.guild, member);
    }

    await newMute(member.guild, [member.user.id], expire);

    altPunish = true;
  }

  if ((await isMuted(member.guild, member)) || altPunish) {
    let muteRole = await member.guild.roles.cache.get(await getMuteRole(member.guild));

    if (!(await getMuteRole(member.guild))) {
      muteRole = await member.guild.roles.cache.find((r) => r.name.toLowerCase() == "muted");
    }

    if (!muteRole) return await deleteMute(member.guild, member);

    member.roles.add(muteRole);
  }
}
