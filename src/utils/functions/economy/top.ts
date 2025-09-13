import dayjs = require("dayjs");
import { Prisma } from "#generated/prisma";
import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { getAllMembers } from "../guilds/members";
import { getUserId, MemberResolvable } from "../member";
import { Mutex } from "../mutex";
import PageManager from "../page";
import { formatTime, pluralize } from "../string";
import { getPreferences } from "../users/notifications";
import { getActiveTag } from "../users/tags";
import { getLastKnownUsername, updateLastKnownUsername } from "../users/username";
import { checkLeaderboardPositions } from "./stats";
import { getAchievements, getItems, getTagsData } from "./utils";
import pAll = require("p-all");
import ms = require("ms");

const WEEK_MS = ms("1 week");

export async function topBalance(guild: Guild, member?: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.economy.findMany({
    where: {
      AND: [{ userId: { in: members } }, { money: { gt: 0 } }, { user: { blacklisted: false } }],
    },
    select: {
      userId: true,
      money: true,
      banned: true,
      user: {
        select: {
          lastKnownUsername: true,
          usernameUpdatedAt: true,
        },
      },
    },
    orderBy: [{ money: "desc" }, { user: { lastKnownUsername: "asc" } }],
  });

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
    if (user.banned && date.isBefore(user.banned)) {
      userIds.splice(userIds.indexOf(user.userId), 1);
      continue;
    }

    const currentCount = count;
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

    count++;

    promises.push(async () => {
      let username = user.user.lastKnownUsername;

      if (user.user.usernameUpdatedAt.getTime() < date.valueOf() - WEEK_MS) {
        const discordUser = await guild.client.users.fetch(user.userId).catch(() => {});

        if (discordUser) {
          username = discordUser.username;
          await updateLastKnownUsername(user.userId, username);
        }
      }

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        true,
      )} $${Number(user.money).toLocaleString()}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
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

export async function topNetWorthGlobal(member: MemberResolvable, amount = 100) {
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

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  checkLeaderboardPositions(userIds, "networth");

  return { pages, pos };
}

const topNetMutex = new Mutex();

export async function topNetWorth(guild: Guild, member?: MemberResolvable) {
  topNetMutex.acquire(guild.id);

  try {
    const members = await getAllMembers(guild);

    const query = await prisma.economy.findMany({
      where: {
        AND: [
          { userId: { in: members } },
          { user: { blacklisted: false } },
          { netWorth: { gt: 0 } },
        ],
      },
      select: {
        userId: true,
        netWorth: true,
        banned: true,
        user: {
          select: {
            lastKnownUsername: true,
            usernameUpdatedAt: true,
          },
        },
      },
      orderBy: [{ netWorth: "desc" }, { user: { lastKnownUsername: "asc" } }],
    });

    const out: string[] = [];
    let count = 0;
    const userIds = query.map((i) => i.userId);
    const promises: (() => Promise<void>)[] = [];
    const date = dayjs();

    for (const user of query) {
      if (user.banned && date.isBefore(user.banned)) {
        userIds.splice(userIds.indexOf(user.userId), 1);
        continue;
      }

      const currentCount = count;
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

      count++;

      promises.push(async () => {
        let username = user.user.lastKnownUsername;

        if (user.user.usernameUpdatedAt.getTime() < date.valueOf() - WEEK_MS) {
          const discordUser = await guild.client.users.fetch(user.userId).catch(() => {});

          if (discordUser) {
            username = discordUser.username;
            await updateLastKnownUsername(user.userId, username);
          }
        }

        out[currentCount] = `${pos} ${await formatUsername(
          user.userId,
          username,
          true,
        )} $${Number(user.netWorth).toLocaleString()}`;
      });
    }

    await pAll(promises, { concurrency: 10 });

    const pages = PageManager.createPages(out);

    let pos = 0;

    if (member) {
      pos = userIds.indexOf(getUserId(member)) + 1;
    }

    return { pages, pos };
  } finally {
    topNetMutex.release(guild.id);
  }
}

export async function topPrestige(guild: Guild, member?: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.economy.findMany({
    where: {
      AND: [
        { userId: { in: members } },
        { OR: [{ prestige: { gt: 0 } }, { level: { gt: 0 } }] },
        { user: { blacklisted: false } },
      ],
    },
    select: {
      userId: true,
      prestige: true,
      level: true,
      banned: true,
      user: {
        select: {
          lastKnownUsername: true,
          usernameUpdatedAt: true,
        },
      },
    },
    orderBy: [{ prestige: "desc" }, { level: "desc" }, { user: { lastKnownUsername: "asc" } }],
  });

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
    if (user.banned && date.isBefore(user.banned)) {
      userIds.splice(userIds.indexOf(user.userId), 1);
      continue;
    }

    const currentCount = count;
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

    count++;

    promises.push(async () => {
      let username = user.user.lastKnownUsername;

      if (user.user.usernameUpdatedAt.getTime() < date.valueOf() - WEEK_MS) {
        const discordUser = await guild.client.users.fetch(user.userId).catch(() => {});

        if (discordUser) {
          username = discordUser.username;
          await updateLastKnownUsername(user.userId, username);
        }
      }

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        true,
      )} P${user.prestige} | L${user.level}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  return { pages, pos };
}

export async function topPrestigeGlobal(member: MemberResolvable, amount = 100) {
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

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  checkLeaderboardPositions(userIds, "prestige");

  return { pages, pos };
}

export async function topItem(guild: Guild, item: string, member: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.inventory.findMany({
    where: {
      AND: [
        { userId: { in: members } },
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
          user: {
            select: {
              lastKnownUsername: true,
              usernameUpdatedAt: true,
            },
          },
        },
      },
    },
    orderBy: [{ amount: "desc" }, { economy: { user: { lastKnownUsername: "asc" } } }],
  });

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
    if (user.economy.banned && date.isBefore(user.economy.banned)) {
      userIds.splice(userIds.indexOf(user.userId), 1);
      continue;
    }

    const currentCount = count;
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

    count++;

    promises.push(async () => {
      let username = user.economy.user.lastKnownUsername;

      if (user.economy.user.usernameUpdatedAt.getTime() < date.valueOf() - WEEK_MS) {
        const discordUser = await guild.client.users.fetch(user.userId).catch(() => {});

        if (discordUser) {
          username = discordUser.username;
          await updateLastKnownUsername(user.userId, username);
        }
      }

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        true,
      )} ${user.amount.toLocaleString()} ${pluralize(getItems()[item], user.amount)}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  return { pages, pos };
}

export async function topItemGlobal(item: string, member?: MemberResolvable, amount = 100) {
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

    out[count] = `${pos} ${await formatUsername(
      user.userId,
      user.economy.user.lastKnownUsername,
      (await getPreferences(user.userId)).leaderboards,
    )} ${user.amount.toLocaleString()} ${pluralize(getItems()[item], user.amount)}`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  checkLeaderboardPositions(userIds, `item-${item}`);

  return { pages, pos };
}

export async function topCompletion(guild: Guild, member: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.achievements.groupBy({
    where: {
      AND: [{ userId: { in: members } }, { completed: true }, { user: { blacklisted: false } }],
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

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
    const currentCount = count;
    const completion = (user._count.completed / allAchievements) * 100;
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

    count++;

    promises.push(async () => {
      const usernameData = await getLastKnownUsername(user.userId, false, true);

      let username = usernameData.lastKnownUsername;

      if (usernameData.usernameUpdatedAt.getTime() < date.valueOf() - WEEK_MS) {
        const discordUser = await guild.client.users.fetch(user.userId).catch(() => {});

        if (discordUser) {
          username = discordUser.username;
          await updateLastKnownUsername(user.userId, username);
        }
      }

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        true,
      )} ${completion.toFixed(1)}%`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
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
  });

  const out: string[] = [];

  for (const guild of query) {
    let position = (query.indexOf(guild) + 1).toString();

    if (position == "1") position = "🥇";
    else if (position == "2") position = "🥈";
    else if (position == "3") position = "🥉";
    else position += ".";

    out.push(
      `${position} **[${guild.guildName}](https://nypsi.xyz/guilds/${encodeURIComponent(
        guild.guildName.replaceAll(" ", "-"),
      )}?ref=bot-lb)** level ${guild.level}`,
    );
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (guildName) {
    pos = query.map((g) => g.guildName).indexOf(guildName) + 1;
  }

  return { pages, pos };
}

export async function topDailyStreak(guild: Guild, member?: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.economy.findMany({
    where: {
      AND: [{ dailyStreak: { gt: 0 } }, { userId: { in: members } }],
    },
    select: {
      userId: true,
      dailyStreak: true,
      banned: true,
      user: {
        select: {
          lastKnownUsername: true,
          usernameUpdatedAt: true,
        },
      },
    },
    orderBy: [{ dailyStreak: "desc" }, { user: { lastKnownUsername: "asc" } }],
  });

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
    if (user.banned && date.isBefore(user.banned)) {
      userIds.splice(userIds.indexOf(user.userId), 1);
      continue;
    }

    const currentCount = count;
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

    count++;

    promises.push(async () => {
      let username = user.user.lastKnownUsername;

      if (user.user.usernameUpdatedAt.getTime() < date.valueOf() - WEEK_MS) {
        const discordUser = await guild.client.users.fetch(user.userId).catch(() => {});

        if (discordUser) {
          username = discordUser.username;
          await updateLastKnownUsername(user.userId, username);
        }
      }

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        true,
      )} ${user.dailyStreak.toLocaleString()}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  return { pages, pos };
}

export async function topDailyStreakGlobal(member: MemberResolvable, amount = 100) {
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

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  checkLeaderboardPositions(userIds, "streak");

  return { pages, pos };
}

export async function topLottoWins(guild: Guild, member?: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.achievements.findMany({
    where: {
      AND: [
        {
          OR: [
            { AND: [{ completed: false }, { achievementId: { startsWith: "lucky_" } }] },
            { AND: [{ completed: true }, { achievementId: { equals: "lucky_v" } }] },
          ],
        },
        { userId: { in: members } },
      ],
    },
    select: {
      userId: true,
      progress: true,
      user: {
        select: {
          lastKnownUsername: true,
          usernameUpdatedAt: true,
        },
      },
    },
    orderBy: {
      progress: "desc",
    },
  });

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
    const currentCount = count;
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

    count++;

    promises.push(async () => {
      let username = user.user.lastKnownUsername;

      if (user.user.usernameUpdatedAt.getTime() < date.valueOf() - WEEK_MS) {
        const discordUser = await guild.client.users.fetch(user.userId).catch(() => {});

        if (discordUser) {
          username = discordUser.username;
          await updateLastKnownUsername(user.userId, username);
        }
      }

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        true,
      )} ${user.progress}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  return { pages, pos };
}

export async function topLottoWinsGlobal(member?: MemberResolvable) {
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

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  return { pages, pos };
}

export async function topWordle(guild: Guild, member: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.wordleGame.groupBy({
    by: ["userId"],
    _count: {
      userId: true,
    },
    orderBy: {
      _count: {
        userId: "desc",
      },
    },
    where: {
      AND: [{ userId: { in: members } }, { won: true }, { user: { blacklisted: false } }],
    },
  });

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
    const currentCount = count;
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

    count++;

    promises.push(async () => {
      const usernameData = await getLastKnownUsername(user.userId, false, true);

      let username = usernameData.lastKnownUsername;

      if (usernameData.usernameUpdatedAt.getTime() < date.valueOf() - WEEK_MS) {
        const discordUser = await guild.client.users.fetch(user.userId).catch(() => {});

        if (discordUser) {
          username = discordUser.username;
          await updateLastKnownUsername(user.userId, username);
        }
      }

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        true,
      )} ${user._count.userId.toLocaleString()} ${pluralize("win", user._count.userId)}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  return { pages, pos };
}

export async function topWordleGlobal(member: MemberResolvable) {
  const query = await prisma.wordleGame.groupBy({
    by: ["userId"],
    _count: {
      userId: true,
    },
    orderBy: {
      _count: {
        userId: "desc",
      },
    },
    take: 100,
    where: {
      AND: [{ won: true }, { user: { blacklisted: false } }],
    },
  });

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
        await getLastKnownUsername(user.userId, false),
        true,
      )} ${user._count.userId.toLocaleString()} ${pluralize("win", user._count.userId)}`,
    );
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = query.findIndex((i) => i.userId === getUserId(member)) + 1;
  }

  checkLeaderboardPositions(
    query.map((i) => i.userId),
    "wordle",
  );

  return { pages, pos };
}

export async function topWordleTime(guild: Guild, member: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query: { userId: string; time: number; gameId: number }[] =
    await prisma.$queryRaw`WITH ranked_results AS (
      SELECT 
          "userId", 
          time AS time, 
          "WordleGame"."id" as "gameId", 
          ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY time ASC) AS rank
      FROM "WordleGame"
      where won = true and "userId" IN (${Prisma.join(members)}) and time > 0
  )
  SELECT "userId", time, "gameId"
  FROM ranked_results
  WHERE rank = 1
  ORDER BY time ASC limit 1000`;

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
    const currentCount = count;
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

    count++;

    promises.push(async () => {
      const usernameData = await getLastKnownUsername(user.userId, false, true);

      let username = usernameData.lastKnownUsername;

      if (usernameData.usernameUpdatedAt.getTime() < date.valueOf() - WEEK_MS) {
        const discordUser = await guild.client.users.fetch(user.userId).catch(() => {});

        if (discordUser) {
          username = discordUser.username;
          await updateLastKnownUsername(user.userId, username);
        }
      }

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        true,
      )} [\`${formatTime(user.time)}\`](https://nypsi.xyz/wordles/${user.gameId?.toString(36)}?ref=bot-lb)`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  return { pages, pos };
}

export async function topWordleTimeGlobal(member?: MemberResolvable) {
  const query: { userId: string; time: number; gameId: number }[] =
    await prisma.$queryRaw`WITH ranked_results AS (
    SELECT 
        "userId", 
        time, 
        "WordleGame"."id" as "gameId", 
        ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY time ASC) AS rank
    FROM "WordleGame"
    where won = true and time > 0
)
SELECT "userId", time, "gameId"
FROM ranked_results
WHERE rank = 1
ORDER BY time ASC limit 100`;

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
        await getLastKnownUsername(user.userId, false),
        true,
      )} [\`${formatTime(user.time)}\`](https://nypsi.xyz/wordles/${user.gameId?.toString(36)}?ref=bot-lb)`,
    );
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = query.findIndex((i) => i.userId === getUserId(member)) + 1;
  }

  checkLeaderboardPositions(
    query.map((i) => i.userId),
    "wordle-time",
  );

  return { pages, pos };
}

export async function topCommand(guild: Guild, command: string, member: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.commandUse.findMany({
    where: {
      AND: [{ userId: { in: members } }, { command: command }, { user: { blacklisted: false } }],
    },
    select: {
      userId: true,
      uses: true,
      user: {
        select: {
          lastKnownUsername: true,
          usernameUpdatedAt: true,
        },
      },
    },
    orderBy: [{ uses: "desc" }, { user: { lastKnownUsername: "asc" } }],
  });

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
    const currentCount = count;
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

    count++;

    promises.push(async () => {
      let username = user.user.lastKnownUsername;

      if (user.user.usernameUpdatedAt.getTime() < date.valueOf() - WEEK_MS) {
        const discordUser = await guild.client.users.fetch(user.userId).catch(() => {});

        if (discordUser) {
          username = discordUser.username;
          await updateLastKnownUsername(user.userId, username);
        }
      }

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        true,
      )} ${user.uses.toLocaleString()} ${pluralize("use", user.uses)}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  return { pages, pos };
}

export async function topCommandGlobal(command: string, member: MemberResolvable) {
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
    )} ${user.uses.toLocaleString()} ${pluralize("use", user.uses)}`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  checkLeaderboardPositions(userIds, "commands");

  return { pages, pos };
}

export async function topCommandUses(guild: Guild, member: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.commandUse.groupBy({
    where: {
      AND: [{ userId: { in: members } }, { user: { blacklisted: false } }],
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
  });

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
    const currentCount = count;
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

    count++;

    promises.push(async () => {
      const usernameData = await getLastKnownUsername(user.userId, false, true);

      let username = usernameData.lastKnownUsername;

      if (usernameData.usernameUpdatedAt.getTime() < date.valueOf() - WEEK_MS) {
        const discordUser = await guild.client.users.fetch(user.userId).catch(() => {});

        if (discordUser) {
          username = discordUser.username;
          await updateLastKnownUsername(user.userId, username);
        }
      }

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        true,
      )} ${user._sum.uses.toLocaleString()} ${pluralize("command", user._sum.uses)}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  return { pages, pos };
}

export async function topCommandUsesGlobal(member?: MemberResolvable) {
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
      await getLastKnownUsername(user.userId, false),
      (await getPreferences(user.userId)).leaderboards,
    )} ${user._sum.uses.toLocaleString()} ${pluralize("command", user._sum.uses)}`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  return { pages, pos };
}

export async function topVote(guild: Guild, member?: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.economy.findMany({
    where: {
      AND: [
        { OR: [{ monthVote: { gt: 0 } }, { seasonVote: { gt: 0 } }] },
        { userId: { in: members } },
        { user: { blacklisted: false } },
      ],
    },
    select: {
      userId: true,
      monthVote: true,
      banned: true,
      user: {
        select: {
          lastKnownUsername: true,
          usernameUpdatedAt: true,
        },
      },
    },
    orderBy: [{ monthVote: "desc" }, { lastVote: "asc" }, { user: { lastKnownUsername: "asc" } }],
  });

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
    if (user.banned && date.isBefore(user.banned)) {
      userIds.splice(userIds.indexOf(user.userId), 1);
      continue;
    }

    const currentCount = count;
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

    count++;

    promises.push(async () => {
      let username = user.user.lastKnownUsername;

      if (user.user.usernameUpdatedAt.getTime() < date.valueOf() - WEEK_MS) {
        const discordUser = await guild.client.users.fetch(user.userId).catch(() => {});

        if (discordUser) {
          username = discordUser.username;
          await updateLastKnownUsername(user.userId, username);
        }
      }

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        true,
      )} ${user.monthVote.toLocaleString()}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  return { pages, pos };
}

export async function topVoteGlobal(member: MemberResolvable, amount = 100) {
  const query = await prisma.economy.findMany({
    where: {
      AND: [{ user: { blacklisted: false } }, { monthVote: { gt: 0 } }],
    },
    select: {
      userId: true,
      monthVote: true,
      banned: true,
      user: {
        select: {
          lastKnownUsername: true,
        },
      },
    },
    orderBy: [{ monthVote: "desc" }, { lastVote: "asc" }, { user: { lastKnownUsername: "asc" } }],
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
    )} ${user.monthVote.toLocaleString()}`;

    count++;
  }

  checkLeaderboardPositions(
    query.map((i) => i.userId),
    "vote",
  );

  const pages = PageManager.createPages(usersFinal);

  let pos = 0;

  if (member) {
    pos = query.map((i) => i.userId).indexOf(getUserId(member)) + 1;
  }

  return { pages, pos };
}

export async function topChatReaction(guild: Guild, daily: boolean, member?: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.chatReactionLeaderboards.findMany({
    where: {
      AND: [
        { daily: daily },
        { userId: { in: members } },
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
          usernameUpdatedAt: true,
        },
      },
    },
    orderBy: [{ time: "asc" }, { user: { lastKnownUsername: "asc" } }],
  });

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
    const currentCount = count;
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

    count++;

    promises.push(async () => {
      let username = user.user.lastKnownUsername;

      if (user.user.usernameUpdatedAt.getTime() < date.valueOf() - WEEK_MS) {
        const discordUser = await guild.client.users.fetch(user.userId).catch(() => {});

        if (discordUser) {
          username = discordUser.username;
          await updateLastKnownUsername(user.userId, username);
        }
      }

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        true,
      )} \`${user.time.toFixed(3)}s\` <t:${Math.floor(user.createdAt.getTime() / 1000)}:${dayjs(user.createdAt).isAfter(dayjs().subtract(1, "day")) ? "R" : "D"}>`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  return { pages, pos };
}

export function topChatReactionGlobal(
  member: MemberResolvable,
  daily: boolean,
  amount: number,
  posOnly: true,
): Promise<number>;

export function topChatReactionGlobal(
  member: MemberResolvable,
  daily: boolean,
  amount?: number,
  posOnly?: false,
): Promise<{ pages: Map<number, string[]>; pos: number }>;

export async function topChatReactionGlobal(
  member: MemberResolvable,
  daily: boolean,
  amount = 100,
  posOnly = false,
): Promise<number | { pages: Map<number, string[]>; pos: number }> {
  const userId = getUserId(member);

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
    take: amount,
  });

  if (posOnly) {
    return query.findIndex((i) => i.userId === userId);
  }

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

export async function topVoteStreak(guild: Guild, member?: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.economy.findMany({
    where: {
      AND: [{ voteStreak: { gt: 0 } }, { userId: { in: members } }],
    },
    select: {
      userId: true,
      voteStreak: true,
      banned: true,
      user: {
        select: {
          lastKnownUsername: true,
          usernameUpdatedAt: true,
        },
      },
    },
    orderBy: [{ voteStreak: "desc" }, { lastVote: "asc" }],
  });

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
    if (user.banned && date.isBefore(user.banned)) {
      userIds.splice(userIds.indexOf(user.userId), 1);
      continue;
    }

    const currentCount = count;
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

    count++;

    promises.push(async () => {
      let username = user.user.lastKnownUsername;

      if (user.user.usernameUpdatedAt.getTime() < date.valueOf() - WEEK_MS) {
        const discordUser = await guild.client.users.fetch(user.userId).catch(() => {});

        if (discordUser) {
          username = discordUser.username;
          await updateLastKnownUsername(user.userId, username);
        }
      }

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        true,
      )} ${user.voteStreak.toLocaleString()}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  return { pages, pos };
}

export async function topVoteStreakGlobal(member?: MemberResolvable, amount = 100) {
  const query = await prisma.economy.findMany({
    where: {
      voteStreak: { gt: 0 },
    },
    select: {
      userId: true,
      voteStreak: true,
      banned: true,
      user: {
        select: {
          lastKnownUsername: true,
        },
      },
    },
    orderBy: [{ voteStreak: "desc" }, { lastVote: "asc" }],
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
    )} ${user.voteStreak.toLocaleString()}`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  checkLeaderboardPositions(userIds, "votestreak");

  return { pages, pos };
}

export async function formatUsername(id: string, username: string, privacy: boolean) {
  if (!privacy)
    return "[**[hidden]**](https://nypsi.xyz/docs/economy/user-settings/hidden?ref=bot-lb)";

  let out = `[**${username}**](https://nypsi.xyz/users/${encodeURIComponent(id)}?ref=bot-lb)`;

  const tag = await getActiveTag(id);

  if (tag) out = `[${getTagsData()[tag.tagId].emoji}] ${out}`;

  return out;
}
