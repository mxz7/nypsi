import { Guild, GuildMember } from "discord.js";
import prisma from "../../../init/database";
import { isEcoBanned } from "../economy/utils";

export async function getReactionStats(guild: Guild, member: GuildMember) {
  const query = await prisma.chatReactionStats.findFirst({
    where: {
      AND: [{ chatReactionGuildId: guild.id }, { userId: member.user.id }],
    },
    select: {
      wins: true,
      second: true,
      third: true,
    },
  });

  return {
    wins: query.wins,
    secondPlace: query.second,
    thirdPlace: query.third,
  };
}

export async function hasReactionStatsProfile(guild: Guild, member: GuildMember) {
  const query = await prisma.chatReactionStats.findFirst({
    where: {
      AND: [{ chatReactionGuildId: guild.id }, { userId: member.user.id }],
    },
    select: {
      userId: true,
    },
  });

  return Boolean(query);
}

export async function createReactionStatsProfile(guild: Guild, member: GuildMember) {
  await prisma.chatReactionStats.create({
    data: {
      chatReactionGuildId: guild.id,
      userId: member.user.id,
    },
  });
}

export async function addWin(guild: Guild, member: GuildMember) {
  if (!(await hasReactionStatsProfile(guild, member)))
    await createReactionStatsProfile(guild, member);

  await prisma.chatReactionStats.updateMany({
    where: {
      AND: [{ chatReactionGuildId: guild.id }, { userId: member.user.id }],
    },
    data: {
      wins: { increment: 1 },
    },
  });
}

export async function add2ndPlace(guild: Guild, member: GuildMember) {
  if (!(await hasReactionStatsProfile(guild, member)))
    await createReactionStatsProfile(guild, member);

  await prisma.chatReactionStats.updateMany({
    where: {
      AND: [{ chatReactionGuildId: guild.id }, { userId: member.user.id }],
    },
    data: {
      second: { increment: 1 },
    },
  });
}

export async function add3rdPlace(guild: Guild, member: GuildMember) {
  if (!(await hasReactionStatsProfile(guild, member)))
    await createReactionStatsProfile(guild, member);

  await prisma.chatReactionStats.updateMany({
    where: {
      AND: [{ chatReactionGuildId: guild.id }, { userId: member.user.id }],
    },
    data: {
      third: { increment: 1 },
    },
  });
}

export async function deleteStats(guild: Guild) {
  await prisma.chatReactionStats.deleteMany({
    where: {
      chatReactionGuildId: guild.id,
    },
  });
}

export async function addLeaderboardEntry(
  userId: string,
  time: number,
): Promise<{ daily: boolean; global: boolean }> {
  const res = { daily: false, global: false };

  async function daily() {
    const query = await prisma.chatReactionLeaderboards.findUnique({
      where: {
        daily_userId: {
          daily: true,
          userId,
        },
      },
      select: {
        time: true,
      },
    });

    if (!query || query.time > time) {
      res.daily = true;
      await prisma.chatReactionLeaderboards.upsert({
        create: {
          daily: true,
          time,
          userId,
        },
        where: {
          daily_userId: {
            daily: true,
            userId,
          },
        },
        update: {
          time,
        },
      });
    }
  }

  async function global() {
    const query = await prisma.chatReactionLeaderboards.findUnique({
      where: {
        daily_userId: {
          daily: false,
          userId,
        },
      },
      select: {
        time: true,
      },
    });

    if (!query || query.time > time) {
      res.global = true;
      await prisma.chatReactionLeaderboards.upsert({
        create: {
          daily: false,
          time,
          userId,
        },
        where: {
          daily_userId: {
            daily: false,
            userId,
          },
        },
        update: {
          time,
        },
      });
    }
  }

  if ((await isEcoBanned(userId)).banned) return res;

  await Promise.all([daily(), global()]);

  return res;
}
