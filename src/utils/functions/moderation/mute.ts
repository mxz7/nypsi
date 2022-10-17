import { Guild, GuildMember, Role } from "discord.js";
import prisma from "../../../init/database";
import { NypsiClient } from "../../../models/Client";

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
}

export async function isMuted(guild: Guild, member: GuildMember) {
  const query = await prisma.moderationMute.findFirst({
    where: {
      AND: [{ guildId: guild.id }, { userId: member.user.id }],
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

  const query = await prisma.moderation.findUnique({
    where: {
      guildId: guildId,
    },
    select: {
      muteRole: true,
    },
  });

  if (query.muteRole == "") {
    return undefined;
  } else {
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

  await prisma.moderation.update({
    where: {
      guildId: guild.id,
    },
    data: {
      muteRole: id,
    },
  });
}

export async function requestUnmute(guildId: string, member: string, client: NypsiClient) {
  const muteRoleId = await getMuteRole(guildId);

  const res = await client.cluster.broadcastEval(
    async (c, { guildId, memberId, muteRoleId }) => {
      const guild = await c.guilds.fetch(guildId).catch(() => {});

      if (!guild) return "guild";

      const member = await guild.members.fetch(memberId).catch(() => {});

      if (!member) return "member";

      let role = muteRoleId;

      try {
        if (muteRoleId == "" || muteRoleId == "default" || !muteRoleId) {
          await guild.roles.fetch();
          role = guild.roles.cache.find((r) => r.name.toLowerCase() == "muted").id;
        } else {
          role = (await guild.roles.fetch(muteRoleId)).id;
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
    }
  );

  if (res.includes(true) || res.includes("member") || res.includes("role")) {
    await deleteMute(guildId, member);
  }
}

export async function getMutedUsers(guild: Guild) {
  const query = await prisma.moderationMute.findMany({
    where: {
      guildId: guild.id,
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
