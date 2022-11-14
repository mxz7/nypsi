import { Guild } from "discord.js";
import prisma from "../../../init/database";

const autoRoleCache = new Map<string, string[]>();

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
