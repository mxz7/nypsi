import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { getExactMember } from "../member";

export async function addAlt(guild: Guild, mainId: string, altId: string) {
  try {
    await prisma.alt.create({
      data: {
        guildId: guild.id,
        mainId: mainId,
        altId: altId,
      },
    });

    return true;
  } catch {
    return false;
  }
}

export async function deleteAlt(guild: Guild, altId: string) {
  await prisma.alt.deleteMany({
    where: {
      AND: [{ guildId: guild.id }, { altId: altId }],
    },
  });
}

export async function getAlts(guild: Guild, mainId: string) {
  const query = await prisma.alt.findMany({
    where: {
      AND: [{ guildId: guild.id }, { mainId: mainId }],
    },
  });
  return query;
}

export async function getAllGroupAccountIds(guild: Guild, userId: string) {
  try {
    let mainId = userId;
  
    if (!await isMainAccount(guild, userId)) mainId = await getMainAccount(guild, userId);
  
    const query = await prisma.alt.findMany({
      where: {
        AND: [{ guildId: guild.id }, { mainId: mainId }],
      },
    });
  
    const ids = [mainId];
  
    for (const alt of query) ids.push(alt.altId);
  
    return ids;
  } catch {
    return [userId];
  }
}

export async function isAlt(guild: Guild, altId: string) {
  const query = await prisma.alt.findFirst({
    where: {
      AND: [{ guildId: guild.id }, { altId: altId }],
    },
  });

  return query && (await getExactMember(guild, await getMainAccount(guild, altId))) ? true : false;
}

export async function isMainAccount(guild: Guild, userId: string) {
  const query = await prisma.alt.findFirst({
    where: {
      AND: [{ guildId: guild.id }, { mainId: userId }],
    },
  });

  return Boolean(query);
}

export async function getMainAccount(guild: Guild, altId: string) {
  const query = await prisma.alt.findFirst({
    where: {
      AND: [{ guildId: guild.id }, { altId: altId }],
    },
    select: {
      mainId: true,
    },
  });

  return query?.mainId || null;
}
