import { Guild, GuildMember, Role } from "discord.js";
import prisma from "../../../init/database";
import { NypsiClient } from "../../../models/Client";
import { unmuteTimeouts } from "../../../scheduled/clusterjobs/moderationchecks";
import { logger } from "../../logger";
import sleep from "../sleep";
import ms = require("ms");

const muteRoleCache = new Map<string, string>();
const autoMuteLevelCache = new Map<string, number[]>();

export const violations = new Map<string, Map<string, { vl: number; startedAt: number }>>();

export function startAutoMuteViolationInterval() {
  setInterval(async () => {
    for (const guildId of violations.keys()) {
      for (const [userId, userVl] of violations.get(guildId).entries()) {
        if (userVl.startedAt < Date.now() - ms("1 day")) violations.get(guildId).delete(userId);
        await sleep(5);
      }

      if (violations.get(guildId).size === 0) violations.delete(guildId);

      await sleep(50);
    }
  }, ms("1 hour"));
}

export async function newMute(guild: Guild, userIDs: string[], date: Date) {
  if (!(userIDs instanceof Array)) {
    userIDs = [userIDs];
  }
  for (const userID of userIDs) {
    await prisma.moderationMute.create({
      data: {
        userId: userID,
        expire: date,
        guildId: guild.id,
      },
    });
  }

  if (date.getTime() - Date.now() < ms("2 minutes")) {
    for (const userId of userIDs) {
      if (unmuteTimeouts.has(`${guild.id}_${userId}`)) continue;
      unmuteTimeouts.add(`${guild.id}_${userId}`);
      setTimeout(() => {
        logger.info(`::auto requesting unmute in ${guild.id} for ${userId}`);
        requestUnmute(guild.id, userId, guild.client as NypsiClient);
      }, date.getTime() - Date.now());
    }
  }
}

export async function isMuted(guild: Guild, member: GuildMember | string) {
  const query = await prisma.moderationMute.findFirst({
    where: {
      AND: [
        { guildId: guild.id },
        { userId: typeof member == "string" ? member : (member as GuildMember).user.id },
      ],
    },
    select: {
      userId: true,
    },
  });

  if (query) {
    return true;
  } else {
    return false;
  }
}

export async function getMuteRole(guild: Guild | string) {
  let guildId: string;
  if (guild instanceof Guild) {
    guildId = guild.id;
  } else {
    guildId = guild;
  }

  if (muteRoleCache.has(guildId)) return muteRoleCache.get(guildId);

  const query = await prisma.guild.findUnique({
    where: {
      id: guildId,
    },
    select: {
      muteRole: true,
    },
  });

  if (query.muteRole == "") {
    muteRoleCache.set(guildId, undefined);
    return undefined;
  } else {
    muteRoleCache.set(guildId, query.muteRole);
    return query.muteRole;
  }
}

export async function setMuteRole(guild: Guild, role: Role | string) {
  let id: string;

  if (role instanceof Role) {
    id = role.id;
  } else {
    id = role;
  }

  if (muteRoleCache.has(guild.id)) muteRoleCache.delete(guild.id);

  await prisma.guild.update({
    where: {
      id: guild.id,
    },
    data: {
      muteRole: id,
    },
  });
}

export async function requestUnmute(guildId: string, member: string, client: NypsiClient) {
  unmuteTimeouts.delete(`${guildId}_${member}`);
  const muteRoleId = await getMuteRole(guildId);

  await client.cluster.broadcastEval(
    async (c, { guildId, memberId, muteRoleId }) => {
      const guild = c.guilds.cache.get(guildId);

      if (!guild) return "guild";

      const member = await guild.members.fetch(memberId).catch(() => {});

      if (!member) return "member";

      let role = muteRoleId;

      try {
        if (muteRoleId == "" || muteRoleId == "default" || !muteRoleId) {
          role = guild.roles.cache.find((r) => r.name.toLowerCase() == "muted").id;
        } else {
          role = guild.roles.cache.get(muteRoleId).id;
        }
      } catch {
        return "role";
      }

      // return guild.roles.cache.find((r) => r.name.toLowerCase() == "muted");
      // return role;

      let fail = false;
      await member.roles.remove(role, "mute expired").catch(() => {
        fail = true;
      });
      if (fail) return "role";
      return true;
    },
    {
      context: { guildId: guildId, memberId: member, muteRoleId: muteRoleId },
    },
  );

  await deleteMute(guildId, member);
}

export async function getMutedUsers(guild: Guild) {
  const query = await prisma.moderationMute.findMany({
    where: {
      guildId: guild.id,
    },
    orderBy: {
      expire: "desc",
    },
  });

  return query;
}

export async function deleteMute(guild: Guild | string, member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.id;
  } else {
    id = member;
  }

  let guildId: string;
  if (guild instanceof Guild) {
    guildId = guild.id;
  } else {
    guildId = guild;
  }

  await prisma.moderationMute.deleteMany({
    where: {
      AND: [{ userId: id }, { guildId: guildId }],
    },
  });
}

export async function getAutoMuteLevels(guild: Guild) {
  let guildId: string;
  if (guild instanceof Guild) {
    guildId = guild.id;
  } else {
    guildId = guild;
  }

  if (autoMuteLevelCache.has(guildId)) {
    return autoMuteLevelCache.get(guildId);
  }

  const query = await prisma.guild.findUnique({
    where: {
      id: guildId,
    },
    select: {
      automute: true,
    },
  });

  autoMuteLevelCache.set(guildId, query.automute);

  return query.automute;
}

export async function setAutoMuteLevels(guild: Guild, levels: number[]) {
  let guildId: string;
  if (guild instanceof Guild) {
    guildId = guild.id;
  } else {
    guildId = guild;
  }

  if (autoMuteLevelCache.has(guildId)) {
    autoMuteLevelCache.delete(guildId);
  }

  await prisma.guild.update({
    where: {
      id: guildId,
    },
    data: {
      automute: levels,
    },
  });
}

export function getMuteViolations(guild: Guild, member: GuildMember) {
  if (violations.get(guild.id)?.get(member.user.id)?.startedAt < Date.now() - ms("1 hour")) {
    violations.get(guild.id).delete(member.user.id);
    return 0;
  }
  return violations.get(guild.id)?.get(member.user.id).vl || 0;
}

export function addMuteViolation(guild: Guild, member: GuildMember) {
  if (!violations.has(guild.id)) {
    violations.set(guild.id, new Map([[member.user.id, { vl: 0, startedAt: Date.now() }]]));
  } else {
    if (violations.get(guild.id).has(member.user.id)) {
      if (violations.get(guild.id).get(member.user.id)?.startedAt < Date.now() - ms("1 hour")) {
        violations.get(guild.id).set(member.user.id, { vl: 0, startedAt: Date.now() });
      } else {
        violations.get(guild.id).get(member.user.id).vl++;
      }
    } else {
      violations.get(guild.id).set(member.user.id, { vl: 0, startedAt: Date.now() });
    }
  }
}
