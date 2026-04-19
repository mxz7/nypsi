import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { NypsiClient } from "../../../models/Client";
import { checkLeaderboardPositions } from "../economy/stats";
import { getAchievements, getItems } from "../economy/utils";
import { getAllMembersRest } from "../guilds/members";
import { getUserId, MemberResolvable } from "../member";
import { pluralize } from "../string";
import { getLastKnownUsername } from "../users/username";
import {
  createLeaderboardOutput,
  formatUsername,
  getAmount,
  getMembers,
  getPos,
  getUsername,
  LeaderboardResult,
} from "./helpers";
import pAll = require("p-all");

export async function topBalance(
  scope: "global",
  guild: undefined,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topBalance(
  scope: "guild",
  guild: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topBalance(
  scope: "guild" | "global",
  guild?: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const query = await prisma.economy.findMany({
    where: {
      AND: [members ? { userId: { in: members } } : undefined, { money: { gt: 0 } }].filter(
        Boolean,
      ),
    },
    select: {
      userId: true,
      money: true,
      user: {
        select: {
          lastKnownUsername: true,
          usernameUpdatedAt: true,
        },
      },
    },
    orderBy: [{ money: "desc" }, { user: { lastKnownUsername: "asc" } }],
    take: getAmount(guild, amount) || undefined,
  });

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];

  for (const user of query) {
    const currentCount = count;
    const pos = getPos(count + 1);

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
      )} $${Number(user.money).toLocaleString()}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  if (scope === "global") {
    checkLeaderboardPositions(userIds, "balance");
  }

  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
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
      AND: [members ? { userId: { in: members } } : undefined, { netWorth: { gt: 0 } }].filter(
        Boolean,
      ),
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
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];

  for (const user of query) {
    const currentCount = count;
    const pos = getPos(count + 1);

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
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];

  for (const user of query) {
    const currentCount = count;
    const pos = getPos(count + 1);

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
      AND: [{ item }, members ? { userId: { in: members } } : undefined].filter(Boolean),
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
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];

  for (const user of query) {
    const currentCount = count;
    const pos = getPos(count + 1);

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
  const members = await getAllMembersRest(guild.id, guild.client as NypsiClient, true);

  const query = await prisma.achievements.groupBy({
    where: {
      AND: [{ userId: { in: members } }, { completed: true }],
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

  for (const user of query) {
    const currentCount = count;
    const completion = (user._count.completed / allAchievements) * 100;
    const pos = getPos(count + 1);

    count++;

    promises.push(async () => {
      const usernameData = await getLastKnownUsername(user.userId, false, true);
      const username = await getUsername(
        user.userId,
        usernameData.lastKnownUsername,
        usernameData.usernameUpdatedAt,
        guild,
      );

      out[currentCount] =
        `${pos} ${await formatUsername(user.userId, username, true)} ${completion.toFixed(1)}%`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
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
  let count = 0;

  for (const guild of query) {
    const pos = getPos(count + 1);
    out[count] = `${pos} **[${guild.guildName}](https://nypsi.xyz/guilds/${encodeURIComponent(
      guild.guildName.replaceAll(" ", "-"),
    )}?ref=bot-lb)** level ${guild.level}`;
    count++;
  }

  return createLeaderboardOutput(
    out,
    query.map((g) => g.guildName),
    guildName,
  );
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
