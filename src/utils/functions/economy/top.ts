import dayjs = require("dayjs");
import { Collection, Guild, GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import Constants from "../../Constants";
import PageManager from "../page";
import { getPreferences } from "../users/notifications";
import { getLastKnownUsername } from "../users/tag";
import { getActiveTag } from "../users/tags";
import workerSort from "../workers/sort";
import wordleSortWorker from "../workers/wordlesort";
import { calcNetWorth } from "./balance";
import { checkLeaderboardPositions } from "./stats";
import { getAchievements, getItems, getTagsData } from "./utils";
import pAll = require("p-all");

export async function topBalance(guild: Guild, userId?: string) {
  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  if (!members) members = guild.members.cache;

  members = members.filter((m) => {
    return !m.user.bot;
  });

  const query = await prisma.economy.findMany({
    where: {
      AND: [
        { money: { gt: 0 } },
        { userId: { in: Array.from(members.keys()) } },
        { user: { blacklisted: false } },
      ],
    },
    select: {
      userId: true,
      money: true,
      banned: true,
    },
    orderBy: [{ money: "desc" }, { user: { lastKnownUsername: "asc" } }],
    take: 100,
  });

  const out = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);

  for (const user of query) {
    if (user.banned && dayjs().isBefore(user.banned)) {
      userIds.splice(userIds.indexOf(user.userId), 1);
      continue;
    }
    if (Number(user.money) != 0) {
      let pos = (count + 1).toString();

      if (pos == "1") {
        pos = "🥇";
      } else if (pos == "2") {
        pos = "🥈";
      } else if (pos == "3") {
        pos = "🥉";
      } else {
        pos += ".";
      }

      out[count] = `${pos} ${await formatUsername(
        user.userId,
        members.get(user.userId).user.username,
        true,
      )} $${Number(user.money).toLocaleString()}`;

      count++;
    }
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topBalanceGlobal(amount: number, allowHidden = true): Promise<string[]> {
  const query = await prisma.economy.findMany({
    where: {
      AND: [{ user: { blacklisted: false } }, { money: { gt: 10_000 } }],
    },
    select: {
      userId: true,
      money: true,
      banned: true,
      user: {
        select: {
          lastKnownUsername: true,
        },
      },
    },
    orderBy: [{ money: "desc" }, { user: { lastKnownUsername: "asc" } }],
    take: amount,
  });

  const usersFinal = [];

  let count = 0;

  for (const user of query) {
    if (count >= amount) break;
    if (usersFinal.join().length >= 1500) break;

    if (user.banned && dayjs().isBefore(user.banned)) {
      continue;
    }

    let pos = (count + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    usersFinal[count] = `${pos} ${await formatUsername(
      user.userId,
      user.user.lastKnownUsername,
      allowHidden ? (await getPreferences(user.userId)).leaderboards : true,
    )} $${Number(user.money).toLocaleString()}`;

    count++;
  }

  checkLeaderboardPositions(
    query.map((i) => i.userId),
    "balance",
  );

  return usersFinal;
}

export async function topNetWorthGlobal(userId: string, amount = 100) {
  const query = await prisma.economy.findMany({
    where: {
      AND: [{ netWorth: { gt: 0 } }, { user: { blacklisted: false } }],
    },
    select: {
      userId: true,
      netWorth: true,
      banned: true,
      user: {
        select: {
          lastKnownUsername: true,
        },
      },
    },
    orderBy: [{ netWorth: "desc" }, { user: { lastKnownUsername: "asc" } }],
    take: amount,
  });

  const out: string[] = [];

  const userIds = query.map((i) => i.userId);

  for (const user of query) {
    if (user.banned && dayjs().isBefore(user.banned)) {
      userIds.splice(userIds.indexOf(user.userId), 1);
      continue;
    }

    let pos = (out.length + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    out.push(
      `${pos} ${await formatUsername(
        user.userId,
        user.user.lastKnownUsername,
        (await getPreferences(user.userId)).leaderboards,
      )} $${Number(user.netWorth).toLocaleString()}`,
    );
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  checkLeaderboardPositions(userIds, "networth");

  return { pages, pos };
}

export async function topNetWorth(guild: Guild, userId?: string) {
  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  if (!members) members = guild.members.cache;

  members = members.filter((m) => {
    return !m.user.bot;
  });

  const query = await prisma.economy.findMany({
    where: {
      AND: [{ userId: { in: Array.from(members.keys()) } }, { user: { blacklisted: false } }],
    },
    select: {
      userId: true,
      banned: true,
    },
  });

  const amounts = new Map<string, number>();
  let userIds: string[] = [];

  const promises = [];

  for (const user of query) {
    if (user.banned && dayjs().isBefore(user.banned)) {
      continue;
    }

    promises.push(async () => {
      const net = await calcNetWorth(user.userId);

      amounts.set(user.userId, net.amount);
      userIds.push(user.userId);
      return;
    });
  }

  await pAll(promises, { concurrency: 25 });

  if (userIds.length > 500) {
    userIds = await workerSort(userIds, amounts);
    userIds.reverse();
  } else {
    inPlaceSort(userIds).desc((i) => amounts.get(i));
  }

  const out = [];

  let count = 0;

  for (const user of userIds) {
    if (out.length >= 100) break;

    if (amounts.get(user) != 0) {
      let pos = (count + 1).toString();

      if (pos == "1") {
        pos = "🥇";
      } else if (pos == "2") {
        pos = "🥈";
      } else if (pos == "3") {
        pos = "🥉";
      } else {
        pos += ".";
      }

      out[count] = `${pos} ${await formatUsername(
        user,
        members.get(user).user.username,
        true,
      )} $${amounts.get(user).toLocaleString()}`;

      count++;
    }
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topPrestige(guild: Guild, userId?: string) {
  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  if (!members) members = guild.members.cache;

  members = members.filter((m) => {
    return !m.user.bot;
  });

  const query = await prisma.economy.findMany({
    where: {
      AND: [
        { OR: [{ prestige: { gt: 0 } }, { level: { gt: 0 } }] },
        { userId: { in: Array.from(members.keys()) } },
        { user: { blacklisted: false } },
      ],
    },
    select: {
      userId: true,
      prestige: true,
      level: true,
      banned: true,
    },
    orderBy: [{ prestige: "desc" }, { level: "desc" }, { user: { lastKnownUsername: "asc" } }],
    take: 100,
  });

  const out = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);

  for (const user of query) {
    if (user.banned && dayjs().isBefore(user.banned)) {
      userIds.splice(userIds.indexOf(user.userId), 1);
      continue;
    }

    let pos = (count + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    out[count] = `${pos} ${await formatUsername(
      user.userId,
      members.get(user.userId).user.username,
      true,
    )} P${user.prestige} | L${user.level}`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topPrestigeGlobal(userId: string, amount = 100) {
  const query = await prisma.economy.findMany({
    where: {
      AND: [
        { OR: [{ prestige: { gt: 0 } }, { level: { gt: 0 } }] },
        { user: { blacklisted: false } },
      ],
    },
    select: {
      userId: true,
      prestige: true,
      banned: true,
      level: true,
      user: {
        select: {
          lastKnownUsername: true,
        },
      },
    },
    orderBy: [{ prestige: "desc" }, { level: "desc" }, { user: { lastKnownUsername: "asc" } }],
    take: amount,
  });

  const out = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);

  for (const user of query) {
    if (user.banned && dayjs().isBefore(user.banned)) {
      userIds.splice(userIds.indexOf(user.userId), 1);
      continue;
    }

    let pos = (count + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    out[count] = `${pos} ${await formatUsername(
      user.userId,
      user.user.lastKnownUsername,
      (await getPreferences(user.userId)).leaderboards,
    )} P${user.prestige} | L${user.level}`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  checkLeaderboardPositions(userIds, "prestige");

  return { pages, pos };
}

export async function topItem(guild: Guild, item: string, userId: string) {
  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  if (!members) members = guild.members.cache;

  members = members.filter((m) => {
    return !m.user.bot;
  });

  const query = await prisma.inventory.findMany({
    where: {
      AND: [
        { userId: { in: Array.from(members.keys()) } },
        { item: item },
        { economy: { user: { blacklisted: false } } },
      ],
    },
    select: {
      userId: true,
      amount: true,
      economy: {
        select: {
          banned: true,
        },
      },
    },
    orderBy: [{ amount: "desc" }, { economy: { user: { lastKnownUsername: "asc" } } }],
    take: 100,
  });

  const out = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);

  for (const user of query) {
    if (user.economy.banned && dayjs().isBefore(user.economy.banned)) {
      userIds.splice(userIds.indexOf(user.userId), 1);
      continue;
    }

    let pos = (count + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    const items = getItems();

    out[count] = `${pos} ${await formatUsername(
      user.userId,
      members.get(user.userId).user.username,
      true,
    )} ${user.amount.toLocaleString()} ${
      user.amount > 1 ? items[item].plural || items[item].name : items[item].name
    }`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topItemGlobal(item: string, userId: string, amount = 100) {
  const query = await prisma.inventory.findMany({
    where: {
      item,
    },
    select: {
      userId: true,
      amount: true,
      economy: {
        select: {
          user: {
            select: {
              lastKnownUsername: true,
            },
          },
          banned: true,
        },
      },
    },
    orderBy: [{ amount: "desc" }, { economy: { user: { lastKnownUsername: "asc" } } }],
    take: amount,
  });

  const out = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);

  for (const user of query) {
    if (user.economy.banned && dayjs().isBefore(user.economy.banned)) {
      userIds.splice(userIds.indexOf(user.userId), 1);
      continue;
    }

    let pos = (count + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    const items = getItems();

    out[count] = `${pos} ${await formatUsername(
      user.userId,
      user.economy.user.lastKnownUsername,
      (await getPreferences(user.userId)).leaderboards,
    )} ${user.amount.toLocaleString()} ${
      user.amount > 1 ? items[item].plural || items[item].name : items[item].name
    }`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  checkLeaderboardPositions(userIds, `item-${item}`);

  return { pages, pos };
}

export async function topCompletion(guild: Guild, userId: string) {
  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  if (!members) members = guild.members.cache;

  members = members.filter((m) => {
    return !m.user.bot;
  });

  const query = await prisma.achievements.findMany({
    where: {
      AND: [
        { completed: true },
        { userId: { in: Array.from(members.keys()) } },
        { user: { blacklisted: false } },
      ],
    },
    select: {
      userId: true,
      user: {
        select: {
          Economy: {
            select: {
              banned: true,
            },
          },
        },
      },
    },
  });

  if (query.length == 0) {
    return { pages: new Map<number, string[]>(), pos: 0 };
  }

  const allAchievements = Object.keys(getAchievements()).length;
  let userIds = query.map((i) => i.userId);
  const completionRate = new Map<string, number>();

  userIds = [...new Set(userIds)];

  for (const userId of userIds) {
    if (
      query.find((u) => u.userId).user?.Economy?.banned &&
      dayjs().isBefore(query.find((u) => u.userId).user.Economy.banned)
    ) {
      userIds.splice(userIds.indexOf(userId), 1);
      continue;
    }

    const achievementsForUser = query.filter((i) => i.userId == userId);

    completionRate.set(userId, (achievementsForUser.length / allAchievements) * 100);
  }

  if (userIds.length > 500) {
    userIds = await workerSort(userIds, completionRate);
    userIds.reverse();
  } else {
    inPlaceSort(userIds).desc((i) => completionRate.get(i));
  }

  const out = [];

  let count = 0;

  for (const user of userIds) {
    if (completionRate.get(user) != 0) {
      let pos = (count + 1).toString();

      if (pos == "1") {
        pos = "🥇";
      } else if (pos == "2") {
        pos = "🥈";
      } else if (pos == "3") {
        pos = "🥉";
      } else {
        pos += ".";
      }

      out[count] = `${pos} ${await formatUsername(
        user,
        members.get(user).user.username,
        true,
      )} ${completionRate.get(user).toFixed(1)}%`;

      count++;
    }
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topGuilds(guildName?: string) {
  const query = await prisma.economyGuild.findMany({
    select: {
      guildName: true,
      level: true,
    },
    orderBy: [{ level: "desc" }, { xp: "desc" }, { balance: "desc" }, { guildName: "asc" }],
    take: 100,
  });

  const out: string[] = [];

  for (const guild of query) {
    let position = (query.indexOf(guild) + 1).toString();

    if (position == "1") position = "🥇";
    else if (position == "2") position = "🥈";
    else if (position == "3") position = "🥉";
    else position += ".";

    out.push(
      `${position} **[${guild.guildName}](https://nypsi.xyz/guild/${encodeURIComponent(
        guild.guildName,
      )})** level ${guild.level}`,
    );
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (guildName) {
    pos = query.map((g) => g.guildName).indexOf(guildName) + 1;
  }

  return { pages, pos };
}

export async function topDailyStreak(guild: Guild, userId?: string) {
  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  if (!members) members = guild.members.cache;

  members = members.filter((m) => {
    return !m.user.bot;
  });

  const query = await prisma.economy.findMany({
    where: {
      AND: [{ dailyStreak: { gt: 0 } }, { userId: { in: Array.from(members.keys()) } }],
    },
    select: {
      userId: true,
      dailyStreak: true,
      banned: true,
    },
    orderBy: [{ dailyStreak: "desc" }, { user: { lastKnownUsername: "asc" } }],
    take: 100,
  });

  const out = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);

  for (const user of query) {
    if (user.banned && dayjs().isBefore(user.banned)) {
      userIds.splice(userIds.indexOf(user.userId), 1);
      continue;
    }

    let pos = (count + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    out[count] = `${pos} ${await formatUsername(
      user.userId,
      members.get(user.userId).user.username,
      true,
    )} ${user.dailyStreak}`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topDailyStreakGlobal(userId: string, amount = 100) {
  const query = await prisma.economy.findMany({
    where: {
      dailyStreak: { gt: 0 },
    },
    select: {
      userId: true,
      dailyStreak: true,
      banned: true,
      user: {
        select: {
          lastKnownUsername: true,
        },
      },
    },
    orderBy: [{ dailyStreak: "desc" }, { user: { lastKnownUsername: "asc" } }],
    take: amount,
  });

  const out = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);

  for (const user of query) {
    if (user.banned && dayjs().isBefore(user.banned)) {
      userIds.splice(userIds.indexOf(user.userId), 1);
      continue;
    }

    let pos = (count + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    out[count] = `${pos} ${await formatUsername(
      user.userId,
      user.user.lastKnownUsername,
      (await getPreferences(user.userId)).leaderboards,
    )} ${user.dailyStreak}`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  checkLeaderboardPositions(userIds, "streak");

  return { pages, pos };
}

export async function topLottoWins(guild: Guild, userId?: string) {
  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  if (!members) members = guild.members.cache;

  members = members.filter((m) => {
    return !m.user.bot;
  });

  const query = await prisma.achievements.findMany({
    where: {
      AND: [
        {
          OR: [
            { AND: [{ completed: false }, { achievementId: { startsWith: "lucky_" } }] },
            { AND: [{ completed: true }, { achievementId: { equals: "lucky_v" } }] },
          ],
        },
        { userId: { in: Array.from(members.keys()) } },
      ],
    },
    select: {
      userId: true,
      progress: true,
    },
    orderBy: {
      progress: "desc",
    },
    take: 100,
  });

  const out = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);

  for (const user of query) {
    let pos = (count + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    out[count] = `${pos} ${await formatUsername(
      user.userId,
      members.get(user.userId).user.username,
      true,
    )} ${user.progress}`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topLottoWinsGlobal(userId: string) {
  const query = await prisma.achievements.findMany({
    where: {
      OR: [
        { AND: [{ completed: false }, { achievementId: { startsWith: "lucky_" } }] },
        { AND: [{ completed: true }, { achievementId: { equals: "lucky_v" } }] },
      ],
    },
    select: {
      userId: true,
      progress: true,
      user: {
        select: {
          id: true,
          lastKnownUsername: true,
        },
      },
    },
    orderBy: {
      progress: "desc",
    },
    take: 100,
  });

  const out = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);

  for (const user of query) {
    let pos = (count + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    out[count] = `${pos} ${await formatUsername(
      user.userId,
      user.user.lastKnownUsername,
      (await getPreferences(user.userId)).leaderboards,
    )} ${query[userIds.indexOf(user.userId)].progress}`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topWordle(guild: Guild, userId: string) {
  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  if (!members) members = guild.members.cache;

  members = members.filter((m) => {
    return !m.user.bot;
  });

  const query = await prisma.wordleStats.findMany({
    where: {
      AND: [
        { userId: { in: Array.from(members.keys()) } },
        {
          OR: [
            { win1: { gt: 0 } },
            { win2: { gt: 0 } },
            { win3: { gt: 0 } },
            { win4: { gt: 0 } },
            { win5: { gt: 0 } },
            { win6: { gt: 0 } },
          ],
        },
      ],
    },
    select: {
      win1: true,
      win2: true,
      win3: true,
      win4: true,
      win5: true,
      win6: true,
      user: {
        select: {
          id: true,
          lastKnownUsername: true,
          blacklisted: true,
        },
      },
    },
  });

  let sorted: {
    wins: number;
    user: {
      lastKnownUsername: string;
      blacklisted: boolean;
      id: string;
    };
  }[];

  if (query.length > 500) {
    sorted = await wordleSortWorker(query);
  } else {
    sorted = query
      .filter((i) => !i.user.blacklisted)
      .map((i) => {
        return { wins: i.win1 + i.win2 + i.win3 + i.win4 + i.win5 + i.win6, user: i.user };
      });

    inPlaceSort(sorted).desc((i) => i.wins);

    if (sorted.length > 100) sorted = sorted.slice(0, 100);
  }

  const out: string[] = [];

  for (const user of sorted) {
    let pos = (out.length + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    out.push(
      `${pos} ${await formatUsername(
        user.user.id,
        members.get(user.user.id).user.username,
        true,
      )} ${user.wins.toLocaleString()} win${user.wins != 1 ? "s" : ""}`,
    );
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = sorted.findIndex((i) => i.user.id === userId) + 1;
  }

  return { pages, pos };
}

export async function topWordleGlobal(userId: string) {
  const query = await prisma.wordleStats.findMany({
    where: {
      OR: [
        { win1: { gt: 0 } },
        { win2: { gt: 0 } },
        { win3: { gt: 0 } },
        { win4: { gt: 0 } },
        { win5: { gt: 0 } },
        { win6: { gt: 0 } },
      ],
    },
    select: {
      win1: true,
      win2: true,
      win3: true,
      win4: true,
      win5: true,
      win6: true,
      user: {
        select: {
          id: true,
          lastKnownUsername: true,
          blacklisted: true,
        },
      },
    },
  });

  const sorted = await wordleSortWorker(query);

  const out: string[] = [];

  for (const user of sorted) {
    let pos = (out.length + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    out.push(
      `${pos} ${await formatUsername(
        user.user.id,
        user.user.lastKnownUsername,
        (await getPreferences(user.user.id)).leaderboards,
      )} ${user.wins.toLocaleString()} wins`,
    );
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = sorted.findIndex((i) => i.user.id === userId) + 1;
  }

  checkLeaderboardPositions(
    sorted.map((i) => i.user.id),
    "wordle",
  );

  return { pages, pos };
}

export async function topCommand(guild: Guild, command: string, userId: string) {
  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  if (!members) members = guild.members.cache;

  members = members.filter((m) => {
    return !m.user.bot;
  });

  const query = await prisma.commandUse.findMany({
    where: {
      AND: [
        { userId: { in: Array.from(members.keys()) } },
        { command: command },
        { user: { blacklisted: false } },
      ],
    },
    select: {
      userId: true,
      uses: true,
    },
    orderBy: [{ uses: "desc" }, { user: { lastKnownUsername: "asc" } }],
    take: 100,
  });

  const out = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);

  for (const user of query) {
    let pos = (count + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    out[count] = `${pos} ${await formatUsername(
      user.userId,
      members.get(user.userId).user.username,
      true,
    )} ${user.uses.toLocaleString()} ${user.uses > 1 ? "uses" : "use"}`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topCommandGlobal(command: string, userId: string) {
  const query = await prisma.commandUse.findMany({
    where: {
      AND: [{ command }, { user: { blacklisted: false } }],
    },
    select: {
      userId: true,
      uses: true,
      user: {
        select: {
          lastKnownUsername: true,
        },
      },
    },
    orderBy: [{ uses: "desc" }, { user: { lastKnownUsername: "asc" } }],
    take: 100,
  });

  const out = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);

  for (const user of query) {
    let pos = (count + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    out[count] = `${pos} ${await formatUsername(
      user.userId,
      user.user.lastKnownUsername,
      (await getPreferences(user.userId)).leaderboards,
    )} ${user.uses.toLocaleString()} ${user.uses > 1 ? "uses" : "use"}`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  checkLeaderboardPositions(userIds, "commands");

  return { pages, pos };
}

export async function topCommandUses(guild: Guild, userId: string) {
  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  if (!members) members = guild.members.cache;

  members = members.filter((m) => {
    return !m.user.bot;
  });

  const query = await prisma.commandUse.groupBy({
    where: {
      AND: [{ userId: { in: Array.from(members.keys()) } }, { user: { blacklisted: false } }],
    },
    by: ["userId"],
    _sum: {
      uses: true,
    },
    orderBy: {
      _sum: {
        uses: "desc",
      },
    },
    take: 100,
  });

  const out = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);

  for (const user of query) {
    let pos = (count + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    out[count] = `${pos} ${await formatUsername(
      user.userId,
      members.get(user.userId).user.username,
      true,
    )} ${user._sum.uses.toLocaleString()} ${user._sum.uses > 1 ? "commands" : "command"}`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topCommandUsesGlobal(userId: string) {
  const query = await prisma.commandUse.groupBy({
    where: {
      user: { blacklisted: false },
    },
    by: ["userId"],
    _sum: {
      uses: true,
    },
    orderBy: {
      _sum: {
        uses: "desc",
      },
    },
    take: 100,
  });

  const out = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);

  for (const user of query) {
    let pos = (count + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    out[count] = `${pos} ${await formatUsername(
      user.userId,
      await getLastKnownUsername(user.userId),
      (await getPreferences(user.userId)).leaderboards,
    )} ${user._sum.uses.toLocaleString()} ${user._sum.uses > 1 ? "commands" : "command"}`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topVote(guild: Guild, userId?: string) {
  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  if (!members) members = guild.members.cache;

  members = members.filter((m) => {
    return !m.user.bot;
  });

  const query = await prisma.economy.findMany({
    where: {
      AND: [
        { OR: [{ monthVote: { gt: 0 } }, { seasonVote: { gt: 0 } }] },
        { userId: { in: Array.from(members.keys()) } },
        { user: { blacklisted: false } },
      ],
    },
    select: {
      userId: true,
      monthVote: true,
      seasonVote: true,
      banned: true,
    },
    orderBy: [{ seasonVote: "desc" }, { lastVote: "asc" }, { user: { lastKnownUsername: "asc" } }],
    take: 100,
  });

  const out = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);

  for (const user of query) {
    if (user.banned && dayjs().isBefore(user.banned)) {
      userIds.splice(userIds.indexOf(user.userId), 1);
      continue;
    }

    let pos = (count + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    out[count] = `${pos} ${await formatUsername(
      user.userId,
      members.get(user.userId).user.username,
      true,
    )} ${
      dayjs().subtract(1, "month").isAfter(Constants.SEASON_START)
        ? `${user.seasonVote.toLocaleString()} | ${user.monthVote.toLocaleString()}`
        : user.monthVote.toLocaleString()
    }`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topVoteGlobal(userId: string, amount = 100) {
  const query = await prisma.economy.findMany({
    where: {
      AND: [
        { user: { blacklisted: false } },
        { OR: [{ monthVote: { gt: 0 } }, { seasonVote: { gt: 0 } }] },
      ],
    },
    select: {
      userId: true,
      monthVote: true,
      seasonVote: true,
      banned: true,
      user: {
        select: {
          lastKnownUsername: true,
        },
      },
    },
    orderBy: [{ seasonVote: "desc" }, { lastVote: "asc" }, { user: { lastKnownUsername: "asc" } }],
    take: amount,
  });

  const usersFinal = [];

  let count = 0;

  for (const user of query) {
    if (count >= amount) break;
    if (usersFinal.join().length >= 1500) break;

    if (user.banned && dayjs().isBefore(user.banned)) {
      continue;
    }

    let pos = (count + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    usersFinal[count] = `${pos} ${await formatUsername(
      user.userId,
      user.user.lastKnownUsername,
      (await getPreferences(user.userId)).leaderboards,
    )} ${
      dayjs().subtract(1, "month").isAfter(Constants.SEASON_START)
        ? `${user.seasonVote.toLocaleString()} | ${user.monthVote.toLocaleString()}`
        : user.monthVote.toLocaleString()
    }`;

    count++;
  }

  checkLeaderboardPositions(
    query.map((i) => i.userId),
    "vote",
  );

  const pages = PageManager.createPages(usersFinal);

  let pos = 0;

  if (userId) {
    pos = query.map((i) => i.userId).indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topChatReaction(guild: Guild, daily: boolean, userId?: string) {
  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  if (!members) members = guild.members.cache;

  members = members.filter((m) => {
    return !m.user.bot;
  });

  const query = await prisma.chatReactionLeaderboards.findMany({
    where: {
      AND: [
        { daily: daily },
        { userId: { in: Array.from(members.keys()) } },
        { user: { blacklisted: false } },
        {
          OR: [
            { user: { Economy: { banned: null } } },
            { user: { Economy: { banned: { lt: new Date() } } } },
          ],
        },
      ],
    },
    select: {
      userId: true,
      time: true,
      createdAt: true,
    },
    orderBy: [{ time: "asc" }, { user: { lastKnownUsername: "asc" } }],
    take: 100,
  });

  const out = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);

  for (const user of query) {
    let pos = (count + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    out[count] = `${pos} ${await formatUsername(
      user.userId,
      members.get(user.userId).user.username,
      true,
    )} \`${user.time.toFixed(3)}s\` <t:${Math.floor(user.createdAt.getTime() / 1000)}:${daily ? "R" : "D"}>`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topChatReactionGlobal(userId: string, daily: boolean, amount = 100) {
  const query = await prisma.chatReactionLeaderboards.findMany({
    where: {
      AND: [
        { daily: daily },
        { user: { blacklisted: false } },
        {
          OR: [
            { user: { Economy: { banned: null } } },
            { user: { Economy: { banned: { lt: new Date() } } } },
          ],
        },
      ],
    },
    select: {
      userId: true,
      time: true,
      createdAt: true,
      user: {
        select: {
          lastKnownUsername: true,
        },
      },
    },
    orderBy: [{ time: "asc" }, { user: { lastKnownUsername: "asc" } }],
    take: 100,
  });

  const usersFinal = [];

  let count = 0;

  for (const user of query) {
    let pos = (count + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    usersFinal[count] = `${pos} ${await formatUsername(
      user.userId,
      user.user.lastKnownUsername,
      (await getPreferences(user.userId)).leaderboards,
    )} \`${user.time.toFixed(3)}s\` <t:${Math.floor(user.createdAt.getTime() / 1000)}:${daily ? "R" : "D"}>`;

    count++;
  }

  checkLeaderboardPositions(
    query.map((i) => i.userId),
    `chatreaction_${daily ? "daily" : "global"}`,
  );

  const pages = PageManager.createPages(usersFinal);

  let pos = 0;

  if (userId) {
    pos = query.map((i) => i.userId).indexOf(userId) + 1;
  }

  return { pages, pos };
}

async function formatUsername(id: string, username: string, privacy: boolean) {
  if (!privacy) return "[**[hidden]**](https://docs.nypsi.xyz/economy/hidden)";

  let out = `[${username}](https://nypsi.xyz/user/${encodeURIComponent(id)})`;

  const tag = await getActiveTag(id);

  if (tag) out = `[${getTagsData()[tag.tagId].emoji}] ${out}`;

  return `**${out}**`;
}
