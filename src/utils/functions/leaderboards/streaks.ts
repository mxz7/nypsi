import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { checkLeaderboardPositions } from "../economy/stats";
import { getUserId, MemberResolvable } from "../member";
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

export async function topDailyStreak(
  scope: "global",
  guild: undefined,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topDailyStreak(
  scope: "guild",
  guild: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topDailyStreak(
  scope: "guild" | "global",
  guild?: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const query = await prisma.economy.findMany({
    where: {
      AND: [{ dailyStreak: { gt: 0 } }, members ? { userId: { in: members } } : undefined].filter(
        Boolean,
      ),
    },
    select: {
      userId: true,
      dailyStreak: true,
      user: {
        select: {
          lastKnownUsername: true,
          usernameUpdatedAt: true,
        },
      },
    },
    orderBy: [{ dailyStreak: "desc" }, { user: { lastKnownUsername: "asc" } }],
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
      )} ${user.dailyStreak.toLocaleString()}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  if (scope === "global") {
    checkLeaderboardPositions(userIds, "streak");
  }

  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}

export async function topVoteStreak(
  scope: "global",
  guild: undefined,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topVoteStreak(
  scope: "guild",
  guild: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topVoteStreak(
  scope: "guild" | "global",
  guild?: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const query = await prisma.economy.findMany({
    where: {
      AND: [{ voteStreak: { gt: 0 } }, members ? { userId: { in: members } } : undefined].filter(
        Boolean,
      ),
    },
    select: {
      userId: true,
      voteStreak: true,
      user: {
        select: {
          lastKnownUsername: true,
          usernameUpdatedAt: true,
        },
      },
    },
    orderBy: [{ voteStreak: "desc" }, { lastVote: "asc" }],
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
      )} ${user.voteStreak.toLocaleString()}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  if (scope === "global") {
    checkLeaderboardPositions(userIds, "votestreak");
  }

  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}
