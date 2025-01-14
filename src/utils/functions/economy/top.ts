import dayjs = require("dayjs");
import { Collection, Guild, GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import Constants from "../../Constants";
import PageManager from "../page";
import sleep from "../sleep";
import { formatTime } from "../string";
import { getPreferences } from "../users/notifications";
import { getLastKnownUsername } from "../users/tag";
import { getActiveTag } from "../users/tags";
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
    take: amount * 2,
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

  return usersFinal.slice(0, amount);
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

const topNetLock = new Set<string>();

export async function topNetWorth(guild: Guild, userId?: string, repeatCount = 1) {
  if (topNetLock.has(guild.id)) {
    if (repeatCount > 50) topNetLock.delete(guild.id);
    await sleep(100);
    return topNetWorth(guild, userId, repeatCount + 1);
  }
  topNetLock.add(guild.id);

  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  if (!members) members = guild.members.cache;

  const users: { userId: string; netWorth: number | bigint }[] = [];

  if (members.size < 1000) {
    const query = await prisma.economy.findMany({
      where: {
        AND: [{ userId: { in: Array.from(members.keys()) } }, { user: { blacklisted: false } }],
      },
      select: {
        userId: true,
        banned: true,
      },
    });

    const promises = [];

    for (const user of query) {
      if (user.banned && dayjs().isBefore(user.banned)) {
        continue;
      }

      promises.push(async () => {
        const net = await calcNetWorth("leaderboard", user.userId);

        users.push({ userId: user.userId, netWorth: net.amount });
      });
    }

    await pAll(promises, { concurrency: 25 });

    inPlaceSort(users).desc((i) => i.netWorth);
  } else {
    const query = await prisma.economy.findMany({
      where: {
        AND: [{ userId: { in: Array.from(members.keys()) } }, { user: { blacklisted: false } }],
      },
      select: {
        userId: true,
        netWorth: true,
        banned: true,
      },
      orderBy: [{ netWorth: "desc" }, { user: { lastKnownUsername: "asc" } }],
    });

    for (const user of query) {
      if (user.banned && dayjs().isBefore(user.banned)) {
        continue;
      }

      users.push({ userId: user.userId, netWorth: user.netWorth });
    }
  }

  const out = [];

  let count = 0;

  for (const user of users) {
    if (out.length >= 100) break;

    if (user.netWorth > 0) {
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
      )} $${Number(user.netWorth).toLocaleString()}`;

      count++;
    }
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = users.findIndex((i) => i.userId === userId) + 1;
  }

  topNetLock.delete(guild.id);

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

  const users: { id: string; completion: number }[] = [];

  const query = await prisma.achievements.groupBy({
    where: {
      AND: [
        { completed: true },
        { userId: { in: Array.from(members.keys()) } },
        { user: { blacklisted: false } },
      ],
    },
    by: ["userId"],
    _count: {
      completed: true,
    },
    orderBy: {
      _count: {
        completed: "desc",
      },
    },
  });

  if (query.length == 0) {
    return { pages: new Map<number, string[]>(), pos: 0 };
  }

  const allAchievements = Object.keys(getAchievements()).length;

  for (const user of query) {
    users.push({
      id: user.userId,
      completion: (user._count.completed / allAchievements) * 100,
    });
  }

  const out = [];

  let count = 0;

  for (const user of users) {
    if (user.completion !== 0) {
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
        user.id,
        members.get(user.id).user.username,
        true,
      )} ${user.completion.toFixed(1)}%`;

      count++;
    }
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = users.findIndex((i) => i.id === userId) + 1;
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
        guild.guildName.replaceAll(" ", "-"),
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
    )} ${user.dailyStreak.toLocaleString()}`;

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
    )} ${user.dailyStreak.toLocaleString()}`;

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

  const query: { wins: number; username: string; userId: string }[] =
    await prisma.$queryRaw`select "userId", count(*) as wins, "User"."lastKnownTag" as username from "WordleGame" left join "User" on "User"."id" = "WordleGame"."userId" where "WordleGame"."userId" in (${Array.from(members.keys()).join(",")}) and "WordleGame"."won" = true and "User"."blacklisted" = false group by "userId", "User"."lastKnownTag" order by wins desc limit 100`;

  const out: string[] = [];

  for (const user of query) {
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
        user.username,
        true,
      )} ${user.wins.toLocaleString()} win${user.wins != 1 ? "s" : ""}`,
    );
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = query.findIndex((i) => i.userId === userId) + 1;
  }

  return { pages, pos };
}

export async function topWordleGlobal(userId: string) {
  const query: { wins: number; username: string; userId: string }[] =
    await prisma.$queryRaw`select "userId", count(*) as wins, "User"."lastKnownTag" as username from "WordleGame" left join "User" on "User"."id" = "WordleGame"."userId" where "WordleGame"."won" = true and "User"."blacklisted" = false group by "userId", "User"."lastKnownTag" order by wins desc limit 100`;

  const out: string[] = [];

  for (const user of query) {
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
        user.username,
        true,
      )} ${user.wins.toLocaleString()} win${user.wins != 1 ? "s" : ""}`,
    );
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = query.findIndex((i) => i.userId === userId) + 1;
  }

  checkLeaderboardPositions(
    query.map((i) => i.userId),
    "wordle",
  );

  return { pages, pos };
}

export async function topWordleTime(guild: Guild, userId: string) {
  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  if (!members) members = guild.members.cache;

  const query: { time: number; username: string; userId: string }[] =
    await prisma.$queryRaw`select "userId", min(time) as time, "User"."lastKnownTag" as username from "WordleGame" left join "User" on "User"."id" = "WordleGame"."userId" where "WordleGame"."userId" in (${Array.from(members.keys()).join(",")}) and "WordleGame"."won" = true and "User"."blacklisted" = false group by "userId", "User"."lastKnownTag" order by time asc limit 100`;

  const out: string[] = [];

  for (const user of query) {
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
        user.username,
        true,
      )} \`${formatTime(user.time)}\``,
    );
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = query.findIndex((i) => i.userId === userId) + 1;
  }

  return { pages, pos };
}

export async function topWordleTimeGlobal(userId: string) {
  const query: { time: number; username: string; userId: string }[] =
    await prisma.$queryRaw`select "userId", min(time) as time, "User"."lastKnownTag" as username from "WordleGame" left join "User" on "User"."id" = "WordleGame"."userId" where "WordleGame"."won" = true and "User"."blacklisted" = false group by "userId", "User"."lastKnownTag" order by time asc limit 100`;

  const out: string[] = [];

  for (const user of query) {
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
        user.username,
        true,
      )} \`${formatTime(user.time)}\``,
    );
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (userId) {
    pos = query.findIndex((i) => i.userId === userId) + 1;
  }

  checkLeaderboardPositions(
    query.map((i) => i.userId),
    "wordle-time",
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
    )} \`${user.time.toFixed(3)}s\` <t:${Math.floor(user.createdAt.getTime() / 1000)}:${dayjs(user.createdAt).isAfter(dayjs().subtract(1, "day")) ? "R" : "D"}>`;

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
    )} \`${user.time.toFixed(3)}s\` <t:${Math.floor(user.createdAt.getTime() / 1000)}:${dayjs(user.createdAt).isAfter(dayjs().subtract(1, "day")) ? "R" : "D"}>`;

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

export async function formatUsername(id: string, username: string, privacy: boolean) {
  if (!privacy) return "[**[hidden]**](https://nypsi.xyz/docs/economy/user-settings/hidden)";

  let out = `[${username}](https://nypsi.xyz/user/${encodeURIComponent(id)})`;

  const tag = await getActiveTag(id);

  if (tag) out = `[${getTagsData()[tag.tagId].emoji}] ${out}`;

  return `**${out}**`;
}
