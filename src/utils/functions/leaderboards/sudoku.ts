import { Guild } from "discord.js";
import { Prisma, SudokuState } from "#generated/prisma";
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

export async function topSudokuWins(
  scope: "global",
  guild: undefined,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topSudokuWins(
  scope: "guild",
  guild: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topSudokuWins(
  scope: "guild" | "global",
  guild?: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const query = await prisma.sudokuGame.groupBy({
    by: ["userId"],
    _count: { userId: true },
    orderBy: { _count: { userId: "desc" } },
    where: {
      state: SudokuState.completed,
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
        `${pos} ${await formatUsername(user.userId, username, scope === "global")} ${user._count.userId.toLocaleString()} ${pluralize("solve", user._count.userId)}`;
    });
  }

  await pAll(promises, { concurrency: 10 });
  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}

export async function topSudokuFastest(
  scope: "global",
  guild: undefined,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topSudokuFastest(
  scope: "guild",
  guild: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topSudokuFastest(
  scope: "guild" | "global",
  guild?: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const limit = getAmount(guild, amount) || 100;
  const memberFilter =
    members && members.length > 0
      ? Prisma.sql`AND "userId" IN (${Prisma.join(members)})`
      : Prisma.empty;

  const query = await prisma.$queryRaw<{ userId: string; fastestMs: bigint }[]>`
    WITH ranked AS (
      SELECT
        "userId",
        EXTRACT(EPOCH FROM ("completedAt" - "startedAt")) * 1000 AS ms,
        ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY ("completedAt" - "startedAt") ASC) AS rank
      FROM "SudokuGame"
      WHERE state = 'completed' AND "completedAt" IS NOT NULL
      ${memberFilter}
    )
    SELECT "userId", ms::bigint AS "fastestMs"
    FROM ranked
    WHERE rank = 1
    ORDER BY "fastestMs" ASC
    LIMIT ${limit}
  `;

  const out: string[] = [];
  const userIds: string[] = [];
  const promises: (() => Promise<void>)[] = [];
  let count = 0;

  for (const user of query) {
    const index = count++;
    userIds.push(user.userId);
    const pos = getPos(index + 1);
    const ms = Number(user.fastestMs);

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
