import { Prisma, PunishmentEndReason, PunishmentType } from "#generated/prisma";
import prisma from "../../../init/database";
import Constants from "../../Constants";

export type PunishmentContext = {
  moderatorId?: string;
  reason?: string;
  endNote?: string;
};

const activePunishmentWhere = (
  userId: string,
  type: PunishmentType,
): Prisma.PunishmentWhereInput => ({
  userId,
  type,
  endedAt: null,
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});

export async function setEconomyPunishment(
  userId: string,
  expiresAt?: Date,
  context: PunishmentContext = {},
) {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    if (expiresAt) {
      await tx.punishment.updateMany({
        where: activePunishmentWhere(userId, PunishmentType.ECONOMY_BAN),
        data: {
          endedAt: now,
          endedById: context.moderatorId,
          endReason: PunishmentEndReason.REPLACED,
        },
      });
      await tx.punishment.create({
        data: {
          userId,
          type: PunishmentType.ECONOMY_BAN,
          reason: context.reason || "automated economy ban",
          moderatorId: context.moderatorId,
          expiresAt,
          season: Constants.SEASON_NUMBER,
        },
      });
    } else {
      await tx.punishment.updateMany({
        where: activePunishmentWhere(userId, PunishmentType.ECONOMY_BAN),
        data: {
          endedAt: now,
          endedById: context.moderatorId,
          endReason: PunishmentEndReason.REVOKED,
          endNote: context.endNote,
        },
      });
    }
  });
}

export async function setBlacklistPunishment(
  userId: string,
  value: boolean,
  context: PunishmentContext = {},
) {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    if (value) {
      await tx.punishment.updateMany({
        where: activePunishmentWhere(userId, PunishmentType.BLACKLIST),
        data: {
          endedAt: now,
          endedById: context.moderatorId,
          endReason: PunishmentEndReason.REPLACED,
        },
      });
      await tx.punishment.create({
        data: {
          userId,
          type: PunishmentType.BLACKLIST,
          reason: context.reason || "blacklisted by staff",
          moderatorId: context.moderatorId,
        },
      });
    } else {
      await tx.punishment.updateMany({
        where: activePunishmentWhere(userId, PunishmentType.BLACKLIST),
        data: {
          endedAt: now,
          endedById: context.moderatorId,
          endReason: PunishmentEndReason.REVOKED,
          endNote: context.endNote,
        },
      });
    }
  });
}

export async function endEconomyPunishmentsForSeasonReset() {
  await prisma.punishment.updateMany({
    where: {
      type: PunishmentType.ECONOMY_BAN,
      endedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    data: {
      endedAt: new Date(),
      endedById: null,
      endReason: PunishmentEndReason.SEASON_RESET,
      endNote: `economy season ${Constants.SEASON_NUMBER} ended`,
    },
  });
}
