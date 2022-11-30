import { Prisma } from "@prisma/client";
import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { StatsProfile } from "../../../models/StatsProfile";
import Constants from "../../Constants";
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

async function createGameId() {
  let gameCount: number;

  if (await redis.exists(Constants.redis.cache.economy.GAME_COUNT)) {
    gameCount = parseInt(await redis.get(Constants.redis.cache.economy.GAME_COUNT));
    await redis.set(Constants.redis.cache.economy.GAME_COUNT, gameCount + 1);
  } else {
    gameCount = await prisma.game.count();
    await redis.set(Constants.redis.cache.economy.GAME_COUNT, gameCount + 1);
  }

  return (gameCount + 1).toString(36);
}

export async function createGame(opts: {
  userId: string;
  game: string;
  win: boolean;
  bet: number;
  earned?: number;
  xp?: number;
  outcome: string;
}): Promise<string> {
  const id = await createGameId();
  let fail = false;

  const res = await prisma.game
    .create({
      data: {
        id,
        userId: opts.userId,
        game: opts.game,
        win: opts.win,
        bet: opts.bet,
        earned: opts.earned,
        xpEarned: opts.xp,
        outcome: opts.outcome,
      },
      select: {
        id: true,
      },
    })
    .catch(() => {
      fail = true;
    });

  if (fail) return createGame(opts);
  if (!res) return createGame(opts);

  addGamble(opts.userId, opts.game, opts.win);

  return res.id;
}

async function addGamble(member: string, game: string, win: boolean) {
  let updateData: Prisma.Without<Prisma.EconomyStatsUpdateInput, Prisma.EconomyStatsUncheckedUpdateInput> &
    Prisma.EconomyStatsUncheckedUpdateInput;
  let createData: Prisma.Without<Prisma.EconomyStatsCreateInput, Prisma.EconomyStatsUncheckedCreateInput> &
    Prisma.EconomyStatsUncheckedCreateInput;

  if (win) {
    updateData = {
      win: { increment: 1 },
    };
    createData = {
      economyUserId: member,
      gamble: true,
      type: game,
      win: 1,
    };
  } else {
    updateData = {
      lose: { increment: 1 },
    };
    createData = {
      economyUserId: member,
      gamble: true,
      type: game,
      lose: 1,
    };
  }

  await prisma.economyStats.upsert({
    where: {
      type_economyUserId: {
        type: game,
        economyUserId: member,
      },
    },
    update: updateData,
    create: createData,
  });

  await addProgress(member, "gambler", 1);
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

export async function addItemUse(member: GuildMember, item: string, amount = 1) {
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
