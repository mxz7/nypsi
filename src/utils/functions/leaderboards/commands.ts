import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { checkLeaderboardPositions } from "../economy/stats";
import { getAllMembers } from "../guilds/members";
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

export async function topCommand(
  scope: "global",
  guild: undefined,
  command: string,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topCommand(
  scope: "guild",
  guild: Guild,
  command: string,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topCommand(
  scope: "guild" | "global",
  guild: Guild | undefined,
  command: string,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const query = await prisma.commandUse.findMany({
    where: {
      AND: [members ? { userId: { in: members } } : undefined, { command }].filter(Boolean),
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
      )} ${user.uses.toLocaleString()} ${pluralize("use", user.uses)}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  if (scope === "global") {
    checkLeaderboardPositions(userIds, "commands");
  }

  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}

export async function topCommandUses(
  scope: "global",
  guild: undefined,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topCommandUses(
  scope: "guild",
  guild: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topCommandUses(
  scope: "guild" | "global",
  guild?: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = guild ? await getAllMembers(guild) : null;

  const query = await prisma.commandUse.groupBy({
    where: {
      AND: [members ? { userId: { in: members } } : undefined].filter(Boolean),
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
      const usernameData = await getLastKnownUsername(user.userId, false, true);

      const username = await getUsername(
        user.userId,
        usernameData.lastKnownUsername,
        usernameData.usernameUpdatedAt,
        guild,
      );

      out[currentCount] = `${pos} ${await formatUsername(
        user.userId,
        username,
        scope === "global",
      )} ${user._sum.uses.toLocaleString()} ${pluralize("command", user._sum.uses)}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}
