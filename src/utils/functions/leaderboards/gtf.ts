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

export async function topGTFWins(
  scope: "global",
  guild: undefined,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topGTFWins(
  scope: "guild",
  guild: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topGTFWins(
  scope: "guild" | "global",
  guild?: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const query = await prisma.flagGame.groupBy({
    by: ["userId"],
    _count: { userId: true },
    orderBy: { _count: { userId: "desc" } },
    where: {
      won: true,
      ...(members ? { userId: { in: members } } : {}),
    },
    take: getAmount(guild, amount) || undefined,
  });

  const out: string[] = [];
  const userIds: string[] = [];
  const promises: (() => Promise<void>)[] = [];
  let count = 0;

  for (const user of query) {
    const index = count++;
    userIds.push(user.userId);
    const pos = getPos(index + 1);

    promises.push(async () => {
      const usernameData = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { lastKnownUsername: true, usernameUpdatedAt: true },
      });

      const username = getUsername(
        user.userId,
        usernameData?.lastKnownUsername,
        usernameData?.usernameUpdatedAt,
        guild,
      );

      out[index] =
        `${pos} ${await formatUsername(user.userId, username, scope === "global")} ${user._count.userId.toLocaleString()} ${pluralize("win", user._count.userId)}`;
    });
  }

  await pAll(promises, { concurrency: 10 });
  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}

export async function topGTFFastest(
  scope: "global",
  guild: undefined,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topGTFFastest(
  scope: "guild",
  guild: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topGTFFastest(
  scope: "guild" | "global",
  guild?: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const query = await prisma.flagGame.groupBy({
    by: ["userId"],
    _min: { time: true },
    orderBy: { _min: { time: "asc" } },
    where: {
      won: true,
      time: { gt: 0 },
      ...(members ? { userId: { in: members } } : {}),
    },
    take: getAmount(guild, amount) || undefined,
  });

  const out: string[] = [];
  const userIds: string[] = [];
  const promises: (() => Promise<void>)[] = [];
  let count = 0;

  for (const user of query) {
    const index = count++;
    userIds.push(user.userId);
    const pos = getPos(index + 1);
    const ms = user._min.time;

    promises.push(async () => {
      const usernameData = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { lastKnownUsername: true, usernameUpdatedAt: true },
      });

      const username = getUsername(
        user.userId,
        usernameData?.lastKnownUsername,
        usernameData?.usernameUpdatedAt,
        guild,
      );

      out[index] =
        `${pos} ${await formatUsername(user.userId, username, scope === "global")} \`${formatTime(ms)}\``;
    });
  }

  await pAll(promises, { concurrency: 10 });
  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}
