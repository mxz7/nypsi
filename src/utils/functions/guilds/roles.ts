import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { getUserId, MemberResolvable } from "../member";
import ms = require("ms");

const autoRoleCache = new Map<string, string[]>();
const persistentRoleCache = new Map<string, string[]>();

setInterval(() => {
  autoRoleCache.clear();
  persistentRoleCache.clear();
}, ms("1 hour"));

export async function getAutoJoinRoles(guild: Guild) {
  if (autoRoleCache.has(guild.id)) return autoRoleCache.get(guild.id);

  const query = await prisma.guild.findUnique({
    where: {
      id: guild.id,
    },
    select: {
      auto_role: true,
    },
  });

  autoRoleCache.set(guild.id, query.auto_role);

  return query.auto_role;
}

export async function setAutoJoinRoles(guild: Guild, roles: string[]) {
  await prisma.guild.update({
    where: {
      id: guild.id,
    },
    data: {
      auto_role: roles,
    },
  });

  autoRoleCache.delete(guild.id);
}

export async function getPersistentRoles(guild: Guild) {
  if (persistentRoleCache.has(guild.id)) return persistentRoleCache.get(guild.id);

  const query = await prisma.guild.findUnique({
    where: { id: guild.id },
    select: { persist_role: true },
  });

  persistentRoleCache.set(guild.id, query.persist_role);

  return query.persist_role;
}

export async function setPersistentRoles(guild: Guild, roles: string[]) {
  await prisma.guild.update({
    where: {
      id: guild.id,
    },
    data: {
      persist_role: roles,
    },
  });

  persistentRoleCache.delete(guild.id);
}

export async function getPersistentRolesForUser(guild: Guild, member: MemberResolvable) {
  const userId = getUserId(member);

  const query: string[] = await prisma.rolePersist
    .findUnique({
      where: {
        guildId_userId: {
          guildId: guild.id,
          userId,
        },
      },
      select: {
        roles: true,
      },
    })
    .then((r) => r.roles)
    .catch((): string[] => []);

  if (query.length > 0) {
    await prisma.rolePersist.delete({
      where: {
        guildId_userId: {
          guildId: guild.id,
          userId,
        },
      },
    });
  }

  return query;
}
