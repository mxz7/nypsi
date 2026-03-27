import dayjs = require("dayjs");
import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { checkLeaderboardPositions } from "../economy/stats";
import { getAchievements, getItems } from "../economy/utils";
import { getAllMembers } from "../guilds/members";
import { getUserId, MemberResolvable } from "../member";
import PageManager from "../page";
import { pluralize } from "../string";
import { getPreferences } from "../users/notifications";
import { getLastKnownUsername, updateLastKnownUsername } from "../users/username";
import {
  createLeaderboardOutput,
  formatUsername,
  getAmount,
  getMembers,
  getPos,
  getUsername,
  LeaderboardResult,
  UPDATE_USERNAME_MS,
} from "./helpers";
import pAll = require("p-all");

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

      if (user.user.usernameUpdatedAt.getTime() < date.valueOf() - UPDATE_USERNAME_MS) {
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

export async function topNetWorth(
  scope: "global",
  guild: undefined,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topNetWorth(
  scope: "guild",
  guild: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topNetWorth(
  scope: "guild" | "global",
  guild?: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const query = await prisma.economy.findMany({
    where: {
      AND: [
        members ? { userId: { in: members } } : undefined,
        { user: { blacklisted: false } },
        { netWorth: { gt: 0 } },
        { OR: [{ banned: null }, { banned: { lt: new Date() } }] },
      ].filter(Boolean),
    },
    select: {
      userId: true,
      netWorth: true,
      user: {
        select: {
          lastKnownUsername: true,
          usernameUpdatedAt: true,
        },
      },
    },
    orderBy: [{ netWorth: "desc" }, { user: { lastKnownUsername: "asc" } }],
    take: getAmount(guild, amount) || undefined,
  });

  const out: string[] = [];
  let count = 1;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];

  for (const user of query) {
    const currentCount = count;
    const pos = getPos(count);

    count++;

    promises.push(async () => {
      const username = await getUsername(
        user.userId,
        user.user.lastKnownUsername,
        user.user.usernameUpdatedAt,
        guild,
      );

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        scope === "global",
      )} $${Number(user.netWorth).toLocaleString()}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  if (scope === "global") {
    checkLeaderboardPositions(userIds, "networth");
  }

  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}

export async function topPrestige(
  scope: "global",
  guild: undefined,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topPrestige(
  scope: "guild",
  guild: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topPrestige(
  scope: "guild" | "global",
  guild?: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const query = await prisma.economy.findMany({
    where: {
      AND: [
        members ? { userId: { in: members } } : undefined,
        { OR: [{ prestige: { gt: 0 } }, { level: { gt: 0 } }] },
      ].filter(Boolean),
    },
    select: {
      userId: true,
      prestige: true,
      level: true,
      user: {
        select: {
          lastKnownUsername: true,
          usernameUpdatedAt: true,
        },
      },
    },
    orderBy: [{ prestige: "desc" }, { level: "desc" }, { user: { lastKnownUsername: "asc" } }],
    take: getAmount(guild, amount) || undefined,
  });

  const out: string[] = [];
  let count = 1;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];

  for (const user of query) {
    const currentCount = count;
    const pos = getPos(count);

    count++;

    promises.push(async () => {
      const username = await getUsername(
        user.userId,
        user.user.lastKnownUsername,
        user.user.usernameUpdatedAt,
        guild,
      );

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        scope === "global",
      )} P${user.prestige} | L${user.level}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  if (scope === "global") {
    checkLeaderboardPositions(userIds, "prestige");
  }

  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}

export async function topItem(
  scope: "global",
  guild: undefined,
  item: string,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topItem(
  scope: "guild",
  guild: Guild,
  item: string,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topItem(
  scope: "guild" | "global",
  guild: Guild | undefined,
  item: string,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const query = await prisma.inventory.findMany({
    where: {
      AND: [
        { item },
        members ? { userId: { in: members } } : undefined,
        { economy: { user: { blacklisted: false } } },
        {
          OR: [
            { economy: { banned: null } },
            { economy: { banned: { lt: new Date() } } },
          ],
        },
      ].filter(Boolean),
    },
    select: {
      userId: true,
      amount: true,
      economy: {
        select: {
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
    take: getAmount(guild, amount) || undefined,
  });

  const out: string[] = [];
  let count = 1;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];

  for (const user of query) {
    const currentCount = count;
    const pos = getPos(count);

    count++;

    promises.push(async () => {
      const username = await getUsername(
        user.userId,
        user.economy.user.lastKnownUsername,
        user.economy.user.usernameUpdatedAt,
        guild,
      );

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        scope === "global",
      )} ${user.amount.toLocaleString()} ${pluralize(getItems()[item], user.amount)}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  if (scope === "global") {
    checkLeaderboardPositions(userIds, `item-${item}`);
  }

  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
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

      if (usernameData.usernameUpdatedAt.getTime() < date.valueOf() - UPDATE_USERNAME_MS) {
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

export async function topLottoWins(
  scope: "global",
  guild: undefined,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topLottoWins(
  scope: "guild",
  guild: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topLottoWins(
  scope: "guild" | "global",
  guild?: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const query = await prisma.achievements.findMany({
    where: {
      AND: [
        {
          OR: [
            { AND: [{ completed: false }, { achievementId: { startsWith: "lucky_" } }] },
            { AND: [{ completed: true }, { achievementId: { equals: "lucky_v" } }] },
          ],
        },
        members ? { userId: { in: members } } : undefined,
      ].filter(Boolean),
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
    take: getAmount(guild, amount) || undefined,
  });

  const out: string[] = [];
  let count = 1;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];

  for (const user of query) {
    const currentCount = count;
    const pos = getPos(count);

    count++;

    promises.push(async () => {
      const username = await getUsername(
        user.userId,
        user.user.lastKnownUsername,
        user.user.usernameUpdatedAt,
        guild,
      );

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        scope === "global",
      )} ${user.progress}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}

export async function topVote(
  scope: "global",
  guild: undefined,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topVote(
  scope: "guild",
  guild: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topVote(
  scope: "guild" | "global",
  guild?: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const query = await prisma.economy.findMany({
    where: {
      AND: [
        { OR: [{ monthVote: { gt: 0 } }, { seasonVote: { gt: 0 } }] },
        members ? { userId: { in: members } } : undefined,
        { user: { blacklisted: false } },
        { OR: [{ banned: null }, { banned: { lt: new Date() } }] },
      ].filter(Boolean),
    },
    select: {
      userId: true,
      monthVote: true,
      user: {
        select: {
          lastKnownUsername: true,
          usernameUpdatedAt: true,
        },
      },
    },
    orderBy: [{ monthVote: "desc" }, { lastVote: "asc" }, { user: { lastKnownUsername: "asc" } }],
    take: getAmount(guild, amount) || undefined,
  });

  const out: string[] = [];
  let count = 1;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];

  for (const user of query) {
    const currentCount = count;
    const pos = getPos(count);

    count++;

    promises.push(async () => {
      const username = await getUsername(
        user.userId,
        user.user.lastKnownUsername,
        user.user.usernameUpdatedAt,
        guild,
      );

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        scope === "global",
      )} ${user.monthVote.toLocaleString()}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  if (scope === "global") {
    checkLeaderboardPositions(userIds, "vote");
  }

  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}
