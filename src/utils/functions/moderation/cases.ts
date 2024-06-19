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
        caseId: caseCount + 1,
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

export async function deleteCase(guild: Guild, caseId: number) {
  await prisma.moderationCase.update({
    where: {
      caseId_guildId: {
        caseId,
        guildId: guild.id,
      },
    },
    data: {
      deleted: true,
    },
  });
}

export async function restoreCase(guild: Guild, caseId: number) {
  await prisma.moderationCase.update({
    where: {
      caseId_guildId: {
        caseId,
        guildId: guild.id,
      },
    },
    data: {
      deleted: false,
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

export async function getCase(guild: Guild, caseId: number) {
  const query = await prisma.moderationCase.findUnique({
    where: {
      caseId_guildId: {
        caseId,
        guildId: guild.id,
      },
    },
    include: {
      evidence: {
        select: {
          id: true,
          createdAt: true,
          userId: true,
          bytes: true,
        },
      },
    },
  });

  if (!query) return undefined;

  return query;
}

export async function setReason(guild: Guild, caseId: number, reason: string) {
  await prisma.moderationCase.update({
    where: {
      caseId_guildId: {
        caseId,
        guildId: guild.id,
      },
    },
    data: {
      command: reason,
    },
  });
}
