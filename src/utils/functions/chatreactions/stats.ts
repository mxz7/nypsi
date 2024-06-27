import { Collection, Guild, GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import { logger } from "../../logger";
import { formatUsername } from "../economy/top";
import { getBlacklisted } from "./blacklisted";

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

  if (query) {
    return true;
  } else {
    return false;
  }
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

export async function getServerLeaderboard(guild: Guild): Promise<Map<string, string>> {
  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch().catch((e) => {
      logger.error("failed to fetch guild members for chat reaction stats", e);
      return guild.members.cache;
    });
  }

  if (!members) members = guild.members.cache;

  members = members.filter((m) => {
    return !m.user.bot;
  });

  const usersWins = [];
  const winsStats = new Map<string, number>();
  const usersSecond = [];
  const secondStats = new Map<string, number>();
  const usersThird = [];
  const thirdStats = new Map<string, number>();
  const overallWins = [];
  const overallStats = new Map<string, number>();

  const query = await prisma.chatReactionStats.findMany({
    where: {
      chatReactionGuildId: guild.id,
    },
    select: {
      userId: true,
      wins: true,
      second: true,
      third: true,
    },
  });

  const blacklisted = await getBlacklisted(guild);

  for (const user of query) {
    let overall = false;

    if (blacklisted.includes(user.userId)) continue;

    if (members.find((member) => member.user.id == user.userId) && user.wins != 0) {
      usersWins.push(user.userId);
      winsStats.set(user.userId, user.wins);
      overall = true;
    }
    if (members.find((member) => member.user.id == user.userId) && user.second != 0) {
      usersSecond.push(user.userId);
      secondStats.set(user.userId, user.second);
      overall = true;
    }
    if (members.find((member) => member.user.id == user.userId) && user.third != 0) {
      usersThird.push(user.userId);
      thirdStats.set(user.userId, user.third);
      overall = true;
    }

    if (overall) {
      overallWins.push(user.userId);
      overallStats.set(user.userId, user.wins + user.second + user.third);
    }
  }

  const getMember = (id: string) => {
    const target = members.find((member) => member.user.id == id);

    return target;
  };

  inPlaceSort(usersWins).desc((i) => winsStats.get(i));
  inPlaceSort(usersSecond).desc((i) => secondStats.get(i));
  inPlaceSort(usersThird).desc((i) => thirdStats.get(i));
  inPlaceSort(overallWins).desc((i) => overallStats.get(i));

  usersWins.splice(10, usersWins.length - 10);
  usersSecond.splice(10, usersSecond.length - 10);
  usersThird.splice(10, usersThird.length - 10);
  overallWins.splice(10, overallWins.length - 10);

  let winsMsg = "";
  let secondMsg = "";
  let thirdMsg = "";
  let overallMsg = "";

  let count = 1;

  for (const user of usersWins) {
    let pos: string | number = count;

    if (count == 1) {
      pos = "🥇";
    } else if (count == 2) {
      pos = "🥈";
    } else if (count == 3) {
      pos = "🥉";
    }

    winsMsg += `${pos} ${await formatUsername(user, members.get(user).user.username, true)} ${winsStats
      .get(user)
      .toLocaleString()}\n`;
    count++;
  }

  count = 1;

  for (const user of usersSecond) {
    let pos: string | number = count;

    if (count == 1) {
      pos = "🥇";
    } else if (count == 2) {
      pos = "🥈";
    } else if (count == 3) {
      pos = "🥉";
    }

    secondMsg += `${pos} ${await formatUsername(user, members.get(user).user.username, true)} ${secondStats
      .get(user)
      .toLocaleString()}\n`;
    count++;
  }

  count = 1;

  for (const user of usersThird) {
    let pos: string | number = count;

    if (count == 1) {
      pos = "🥇";
    } else if (count == 2) {
      pos = "🥈";
    } else if (count == 3) {
      pos = "🥉";
    }

    thirdMsg += `${pos} ${await formatUsername(user, members.get(user).user.username, true)} ${thirdStats
      .get(user)
      .toLocaleString()}\n`;
    count++;
  }

  count = 1;

  for (const user of overallWins) {
    let pos: string | number = count;

    if (count == 1) {
      pos = "🥇";
    } else if (count == 2) {
      pos = "🥈";
    } else if (count == 3) {
      pos = "🥉";
    }

    overallMsg += `${pos} ${await formatUsername(user, members.get(user).user.username, true)} ${overallStats
      .get(user)
      .toLocaleString()}\n`;
    count++;
  }

  return new Map<string, string>()
    .set("wins", winsMsg)
    .set("second", secondMsg)
    .set("third", thirdMsg)
    .set("overall", overallMsg);
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

  await Promise.all([daily(), global()]);

  return res;
}
