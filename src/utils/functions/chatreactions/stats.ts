import { Collection, Guild, GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import { addCooldown, inCooldown } from "../guilds/utils";

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
  await prisma.chatReactionStats.updateMany({
    where: {
      AND: [{ chatReactionGuildId: guild.id }, { userId: member.user.id }],
    },
    data: {
      third: { increment: 1 },
    },
  });
}

export async function getServerLeaderboard(guild: Guild, amount: number): Promise<Map<string, string>> {
  let members: Collection<string, GuildMember>;

  if (inCooldown(guild) || guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();

    addCooldown(guild, 3600);
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

  for (const user of query) {
    let overall = false;

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

  usersWins.splice(amount, usersWins.length - amount);
  usersSecond.splice(amount, usersSecond.length - amount);
  usersThird.splice(amount, usersThird.length - amount);
  overallWins.splice(amount, overallWins.length - amount);

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

    winsMsg += `${pos} **${getMember(user).user.tag}** ${winsStats.get(user).toLocaleString()}\n`;
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

    secondMsg += `${pos} **${getMember(user).user.tag}** ${secondStats.get(user).toLocaleString()}\n`;
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

    thirdMsg += `${pos} **${getMember(user).user.tag}** ${thirdStats.get(user).toLocaleString()}\n`;
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

    overallMsg += `${pos} **${getMember(user).user.tag}** ${overallStats.get(user).toLocaleString()}\n`;
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
