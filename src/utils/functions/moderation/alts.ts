import { Guild } from "discord.js";
import prisma from "../../../init/database";

export async function addAlt(
  guild: Guild,
  mainId: string,
  altId: string,
) {
  try {
    await prisma.alt.create({
      data: {
        guildId: guild.id,
        mainId: mainId,
        userId: altId,
      },
    })
  
    return true;
  } catch {
    return false;
  }
}

export async function deleteAlt(guild: Guild, userId: string) {
  await prisma.alt.deleteMany({
    where: {
      AND: [{ guildId: guild.id }, { userId: userId }],
    }
  });
}

export async function getAlts(guild: Guild, userId: string) {
  const query = await prisma.alt.findMany({
    where: {
      AND: [{ guildId: guild.id }, { mainId: userId }],
    }
  });
  return query;
}

export async function isAlt(guild: Guild, userId: string) {
  const query = await prisma.alt.findMany({
    where: {
      AND: [{ guildId: guild.id }, { userId: userId }],
    }
  });
  return query.length == 1;
}

export async function getMainAccount(guild: Guild, userId: string) {
  const query = await prisma.alt.findMany({
    where: {
      AND: [{ guildId: guild.id }, { userId: userId }],
    }
  });
  if (query.length == 0) return null;
  return query[0].mainId;
}