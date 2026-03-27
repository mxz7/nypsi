import dayjs = require("dayjs");
import { Guild } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import { checkLeaderboardPositions } from "../economy/stats";
import { getAllMembers } from "../guilds/members";
import { getUserId, MemberResolvable } from "../member";
import { getBlacklisted } from "../chatreactions/blacklisted";
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

export async function getServerLeaderboard(guild: Guild): Promise<Map<string, string>> {
  let members = await getAllMembers(guild, true);

  members = members.filter((m) => {
    return !m.user.bot;
  });

  const usersWins = [];
  const winsStats = new Map<string, number>();
  const usersSecond = [];
  const secondStats = new Map<string, number>();
  const usersThird = [];
  const thirdStats = new Map<string, number>();
  const overallWins = [];
  const overallStats = new Map<string, number>();

  const query = await prisma.chatReactionStats.findMany({
    where: {
      chatReactionGuildId: guild.id,
    },
    select: {
      userId: true,
      wins: true,
      second: true,
      third: true,
    },
  });

  const blacklisted = await getBlacklisted(guild);

  for (const user of query) {
    let overall = false;

    if (blacklisted.includes(user.userId)) continue;

    if (members.get(user.userId) && user.wins != 0) {
      usersWins.push(user.userId);
      winsStats.set(user.userId, user.wins);
      overall = true;
    }
    if (members.get(user.userId) && user.second != 0) {
      usersSecond.push(user.userId);
      secondStats.set(user.userId, user.second);
      overall = true;
    }
    if (members.get(user.userId) && user.third != 0) {
      usersThird.push(user.userId);
      thirdStats.set(user.userId, user.third);
      overall = true;
    }

    if (overall) {
      overallWins.push(user.userId);
      overallStats.set(user.userId, user.wins + user.second + user.third);
    }
  }

  inPlaceSort(usersWins).desc((i) => winsStats.get(i));
  inPlaceSort(usersSecond).desc((i) => secondStats.get(i));
  inPlaceSort(usersThird).desc((i) => thirdStats.get(i));
  inPlaceSort(overallWins).desc((i) => overallStats.get(i));

  usersWins.splice(10, usersWins.length - 10);
  usersSecond.splice(10, usersSecond.length - 10);
  usersThird.splice(10, usersThird.length - 10);
  overallWins.splice(10, overallWins.length - 10);

  let winsMsg = "";
  let secondMsg = "";
  let thirdMsg = "";
  let overallMsg = "";

  let count = 1;

  for (const user of usersWins) {
    let pos: string | number = count;

    if (count == 1) {
      pos = "🥇";
    } else if (count == 2) {
      pos = "🥈";
    } else if (count == 3) {
      pos = "🥉";
    }

    winsMsg += `${pos} ${await formatUsername(user, members.get(user).user.username, true)} ${winsStats
      .get(user)
      .toLocaleString()}\n`;
    count++;
  }

  count = 1;

  for (const user of usersSecond) {
    let pos: string | number = count;

    if (count == 1) {
      pos = "🥇";
    } else if (count == 2) {
      pos = "🥈";
    } else if (count == 3) {
      pos = "🥉";
    }

    secondMsg += `${pos} ${await formatUsername(user, members.get(user).user.username, true)} ${secondStats
      .get(user)
      .toLocaleString()}\n`;
    count++;
  }

  count = 1;

  for (const user of usersThird) {
    let pos: string | number = count;

    if (count == 1) {
      pos = "🥇";
    } else if (count == 2) {
      pos = "🥈";
    } else if (count == 3) {
      pos = "🥉";
    }

    thirdMsg += `${pos} ${await formatUsername(user, members.get(user).user.username, true)} ${thirdStats
      .get(user)
      .toLocaleString()}\n`;
    count++;
  }

  count = 1;

  for (const user of overallWins) {
    let pos: string | number = count;

    if (count == 1) {
      pos = "🥇";
    } else if (count == 2) {
      pos = "🥈";
    } else if (count == 3) {
      pos = "🥉";
    }

    overallMsg += `${pos} ${await formatUsername(user, members.get(user).user.username, true)} ${overallStats
      .get(user)
      .toLocaleString()}\n`;
    count++;
  }

  return new Map<string, string>()
    .set("wins", winsMsg)
    .set("second", secondMsg)
    .set("third", thirdMsg)
    .set("overall", overallMsg);
}

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
