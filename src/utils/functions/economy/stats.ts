import { Prisma } from "@prisma/client";
import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import { StatsProfile } from "../../../models/StatsProfile";
import { addProgress } from "./achievements";

export async function getStats(member: GuildMember): Promise<StatsProfile> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.economyStats.findMany({
    where: {
      economyUserId: id,
    },
    orderBy: {
      win: "desc",
    },
  });

  return new StatsProfile(query);
}

export async function addGamble(member: GuildMember, game: string, win: boolean) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  let updateData: Prisma.Without<Prisma.EconomyStatsUpdateInput, Prisma.EconomyStatsUncheckedUpdateInput> &
    Prisma.EconomyStatsUncheckedUpdateInput;
  let createData: Prisma.Without<Prisma.EconomyStatsCreateInput, Prisma.EconomyStatsUncheckedCreateInput> &
    Prisma.EconomyStatsUncheckedCreateInput;

  if (win) {
    updateData = {
      win: { increment: 1 },
    };
    createData = {
      economyUserId: id,
      gamble: true,
      type: game,
      win: 1,
    };
  } else {
    updateData = {
      lose: { increment: 1 },
    };
    createData = {
      economyUserId: id,
      gamble: true,
      type: game,
      lose: 1,
    };
  }

  await prisma.economyStats.upsert({
    where: {
      type_economyUserId: {
        type: game,
        economyUserId: id,
      },
    },
    update: updateData,
    create: createData,
  });

  await addProgress(id, "gambler", 1);
}

export async function addRob(member: GuildMember, win: boolean) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.economyStats.findFirst({
    where: {
      AND: [{ economyUserId: id }, { type: "rob" }],
    },
    select: {
      economyUserId: true,
    },
  });

  if (query) {
    if (win) {
      await prisma.economyStats.updateMany({
        where: {
          AND: [{ economyUserId: id }, { type: "rob" }],
        },
        data: {
          win: { increment: 1 },
        },
      });
    } else {
      await prisma.economyStats.updateMany({
        where: {
          AND: [{ economyUserId: id }, { type: "rob" }],
        },
        data: {
          lose: { increment: 1 },
        },
      });
    }
  } else {
    if (win) {
      await prisma.economyStats.create({
        data: {
          economyUserId: id,
          type: "rob",
          win: 1,
          gamble: true,
        },
      });
    } else {
      await prisma.economyStats.create({
        data: {
          economyUserId: id,
          type: "rob",
          lose: 1,
          gamble: true,
        },
      });
    }
  }
}

export async function addItemUse(member: GuildMember | string, item: string, amount = 1) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.economyStats.upsert({
    where: {
      type_economyUserId: {
        economyUserId: id,
        type: item,
      },
    },
    update: {
      win: { increment: amount },
    },
    create: {
      economyUserId: id,
      type: item,
      gamble: false,
      win: amount,
    },
  });
}
