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
        altId: altId,
      },
    })
  
    return true;
  } catch {
    return false;
  }
}

export async function deleteAlt(guild: Guild, altId: string) {
  await prisma.alt.deleteMany({
    where: {
      AND: [{ guildId: guild.id }, { altId: altId }],
    }
  });
}

export async function getAlts(guild: Guild, altId: string) {
  const query = await prisma.alt.findMany({
    where: {
      AND: [{ guildId: guild.id }, { mainId: altId }],
    }
  });
  return query;
}

export async function isAlt(guild: Guild, altId: string) {
  const query = await prisma.alt.findMany({
    where: {
      AND: [{ guildId: guild.id }, { altId: altId }],
    }
  });
  return query.length == 1;
}

export async function getMainAccount(guild: Guild, altId: string) {
  const query = await prisma.alt.findMany({
    where: {
      AND: [{ guildId: guild.id }, { altId: altId }],
    }
  });
  if (query.length == 0) return null;
  return query[0].mainId;
}