import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { getUserId, MemberResolvable } from "../member";
import { formatTime, pluralize } from "../string";
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

export async function topChessSolved(
  scope: "global",
  guild: undefined,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topChessSolved(
  scope: "guild",
  guild: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topChessSolved(
  scope: "guild" | "global",
  guild?: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const query = await prisma.chessPuzzleStats.findMany({
    where: {
      AND: [members ? { userId: { in: members } } : undefined, { solved: { gt: 0 } }].filter(
        Boolean,
      ),
    },
    orderBy: { solved: "desc" },
    select: {
      userId: true,
      solved: true,
      user: {
        select: {
          lastKnownUsername: true,
          usernameUpdatedAt: true,
        },
      },
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

      out[currentCount] =
        `${pos} ${await formatUsername(user.userId, username, scope === "global")} ${user.solved.toLocaleString()} ${pluralize("solve", user.solved)}`;
    });
  }

  await pAll(promises, { concurrency: 10 });
  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}

export async function topChessAvgRating(
  scope: "global",
  guild: undefined,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topChessAvgRating(
  scope: "guild",
  guild: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topChessAvgRating(
  scope: "guild" | "global",
  guild?: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const query = await prisma.chessPuzzleStats.findMany({
    where: {
      AND: [
        members ? { userId: { in: members } } : undefined,
        { solved: { gt: 0 } },
        { averageWinningRating: { gt: 0 } },
      ].filter(Boolean),
    },
    orderBy: { averageWinningRating: "desc" },
    select: {
      userId: true,
      averageWinningRating: true,
      user: {
        select: {
          lastKnownUsername: true,
          usernameUpdatedAt: true,
        },
      },
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

      out[currentCount] =
        `${pos} ${await formatUsername(user.userId, username, scope === "global")} avg \`${Math.round(user.averageWinningRating).toLocaleString()}\` rating`;
    });
  }

  await pAll(promises, { concurrency: 10 });
  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}

export async function topChessFastestSolve(
  scope: "global",
  guild: undefined,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topChessFastestSolve(
  scope: "guild",
  guild: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topChessFastestSolve(
  scope: "guild" | "global",
  guild?: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const query = await prisma.chessPuzzleStats.findMany({
    where: {
      AND: [
        members ? { userId: { in: members } } : undefined,
        { fastestSolve: { not: null } },
      ].filter(Boolean),
    },
    orderBy: { fastestSolve: "asc" },
    select: {
      userId: true,
      fastestSolve: true,
      user: {
        select: {
          lastKnownUsername: true,
          usernameUpdatedAt: true,
        },
      },
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

      out[currentCount] =
        `${pos} ${await formatUsername(user.userId, username, scope === "global")} \`${formatTime(user.fastestSolve)}\``;
    });
  }

  await pAll(promises, { concurrency: 10 });
  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}
