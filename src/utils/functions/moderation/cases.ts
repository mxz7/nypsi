import { Guild, User } from "discord.js";
import prisma from "../../../init/database";
import { PunishmentType } from "../../../types/Moderation";
import { addModLog, isModLogsEnabled } from "./logs";

export async function getCaseCount(guild: Guild) {
  const query = await prisma.moderationCase.count({
    where: {
      guildId: guild.id,
    },
  });

  return query;
}

export async function newCase(
  guild: Guild,
  caseType: PunishmentType,
  userIDs: string[] | string,
  moderator: User,
  command: string,
) {
  if (!(userIDs instanceof Array)) {
    userIDs = [userIDs];
  }
  for (const userID of userIDs) {
    const caseCount = await getCaseCount(guild);
    await prisma.moderationCase.create({
      data: {
        guildId: guild.id,
        caseId: caseCount.toString(),
        caseId_new: caseCount + 1,
        type: caseType,
        user: userID,
        moderator: moderator.id,
        command: command,
        time: new Date(),
      },
    });

    if (!(await isModLogsEnabled(guild))) return;

    addModLog(guild, caseType, userID, moderator, command, caseCount);
  }
}

export async function deleteCase(guild: Guild, caseID: string) {
  await prisma.moderationCase.updateMany({
    where: {
      AND: [{ guildId: guild.id }, { caseId: caseID.toString() }],
    },
    data: {
      deleted: true,
    },
  });
}

export async function getCases(guild: Guild, userID: string) {
  const query = await prisma.moderationCase.findMany({
    where: {
      AND: [{ guildId: guild.id }, { user: userID }],
    },
    orderBy: {
      time: "desc",
    },
  });

  return query;
}

export async function getAllCases(guild: Guild) {
  const query = await prisma.moderationCase.findMany({
    where: {
      guildId: guild.id,
    },
    select: {
      user: true,
      moderator: true,
      type: true,
      deleted: true,
    },
    orderBy: {
      time: "desc",
    },
  });

  return query;
}

export async function getCase(guild: Guild, caseID: number) {
  if (caseID > (await getCaseCount(guild))) return undefined;

  const query = await prisma.moderationCase.findFirst({
    where: {
      AND: [{ guildId: guild.id }, { caseId: caseID.toString() }],
    },
  });

  if (!query) return undefined;

  return query;
}

export async function setReason(guild: Guild, caseID: number, reason: string) {
  await prisma.moderationCase.updateMany({
    where: {
      AND: [{ caseId: caseID.toString() }, { guildId: guild.id }],
    },
    data: {
      command: reason,
    },
  });
}
