import dayjs = require("dayjs");
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

export async function topChatReaction(
  scope: "global",
  guild: undefined,
  daily: boolean,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topChatReaction(
  scope: "guild",
  guild: Guild,
  daily: boolean,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topChatReaction(
  scope: "guild" | "global",
  guild: Guild | undefined,
  daily: boolean,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const query = await prisma.chatReactionLeaderboards.findMany({
    where: {
      AND: [
        { daily },
        members ? { userId: { in: members } } : undefined,
        { user: { blacklisted: false } },
        {
          OR: [
            { user: { Economy: { banned: null } } },
            { user: { Economy: { banned: { lt: new Date() } } } },
          ],
        },
      ].filter(Boolean),
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
      )} \`${user.time.toFixed(3)}s\` <t:${Math.floor(user.createdAt.getTime() / 1000)}:${dayjs(user.createdAt).isAfter(dayjs().subtract(1, "day")) ? "R" : "D"}>`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  if (scope === "global") {
    checkLeaderboardPositions(userIds, `chatreaction_${daily ? "daily" : "global"}`);
  }

  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}
