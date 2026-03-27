import dayjs = require("dayjs");
import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { checkLeaderboardPositions } from "../economy/stats";
import { getItems } from "../economy/utils";
import { getAllMembers } from "../guilds/members";
import { getUserId, MemberResolvable } from "../member";
import PageManager from "../page";
import { pluralize } from "../string";
import { getPreferences } from "../users/notifications";
import { updateLastKnownUsername } from "../users/username";
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

export async function topMuseumCompletion(
  scope: "global",
  guild: undefined,
  item: string,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topMuseumCompletion(
  scope: "guild",
  guild: Guild,
  item: string,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topMuseumCompletion(
  scope: "guild" | "global",
  guild: Guild | undefined,
  item: string,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);
  const takeAmount = getAmount(guild, amount) || undefined;

  const query = await prisma.museum.findMany({
    where: {
      AND: [
        ...(members ? [{ userId: { in: members } }] : []),
        { itemId: item },
        { completedAt: { not: null } },
        ...(members ? [{ economy: { user: { blacklisted: false } } }] : []),
      ],
    },
    select: {
      userId: true,
      completedAt: true,
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
    orderBy: [{ completedAt: "asc" }, { economy: { user: { lastKnownUsername: "asc" } } }],
    ...(takeAmount ? { take: takeAmount } : {}),
  });

  const out: string[] = [];
  const userIds: string[] = [];
  const promises: (() => Promise<void>)[] = [];
  let count = 0;

  for (const user of query) {
    if (user.economy.banned && dayjs().isBefore(user.economy.banned)) continue;

    const index = count++;
    userIds.push(user.userId);
    const pos = getPos(index + 1);

    promises.push(async () => {
      const username = await getUsername(
        user.userId,
        user.economy.user.lastKnownUsername,
        user.economy.user.usernameUpdatedAt,
        guild,
      );

      out[index] =
        `${pos} ${await formatUsername(user.userId, username, scope === "global")} <t:${Math.floor(new Date(user.completedAt).getTime() / 1000)}:f>`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  if (scope === "global") checkLeaderboardPositions(userIds, `museum-completion-item-${item}`);

  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}

export async function topMuseumCompletions(guild: Guild, member: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.$queryRaw<
    {
      userId: string;
      totalCompleted: number;
      banned: Date;
      lastKnownUsername: string;
      usernameUpdatedAt: Date;
    }[]
  >`
      SELECT
        m."userId",
        COUNT(m."completedAt") AS "totalCompleted",
        e."banned",
        u."lastKnownUsername",
        u."usernameUpdatedAt"
      FROM "Museum" m
      JOIN "Economy" e ON m."userId" = e."userId"
      JOIN "User" u ON e."userId" = u."id"
      WHERE m."completedAt" IS NOT NULL
        AND m."userId" = ANY(${members})
        AND u."blacklisted" = false
      GROUP BY m."userId", e."banned", u."lastKnownUsername", u."usernameUpdatedAt"
      ORDER BY "totalCompleted" DESC, "lastKnownUsername" ASC;
    `;

  const percentOut: string[] = [];
  const amountOut: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();
  const museumItemCount = Object.values(getItems()).filter((i) => i.museum).length;

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
      let username = user.lastKnownUsername;

      if (user.usernameUpdatedAt.getTime() < date.valueOf() - UPDATE_USERNAME_MS) {
        const discordUser = await guild.client.users.fetch(user.userId).catch(() => {});

        if (discordUser) {
          username = discordUser.username;
          await updateLastKnownUsername(user.userId, username);
        }
      }

      const formattedName = await formatUsername(user.userId, username, true);

      amountOut[currentCount] = `${pos} ${formattedName} ${user.totalCompleted.toLocaleString()}`;
      percentOut[currentCount] =
        `${pos} ${formattedName} ${((Number(user.totalCompleted) / museumItemCount) * 100).toFixed(1)}%`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  const percentPages = PageManager.createPages(percentOut);
  const amountPages = PageManager.createPages(amountOut);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  return { percentPages, amountPages, pos };
}

export async function topMuseumCompletionsGlobal(member?: MemberResolvable, amount = 100) {
  const query = await prisma.$queryRaw<
    {
      userId: string;
      totalCompleted: number;
      banned: Date;
      lastKnownUsername: string;
    }[]
  >`
    SELECT
      m."userId",
      COUNT(m."completedAt") AS "totalCompleted",
      e."banned",
      u."lastKnownUsername"
    FROM "Museum" m
    JOIN "Economy" e ON m."userId" = e."userId"
    JOIN "User" u ON e."userId" = u."id"
    WHERE m."completedAt" IS NOT NULL
    GROUP BY m."userId", e."banned", u."lastKnownUsername"
    ORDER BY "totalCompleted" DESC, "lastKnownUsername" ASC
    LIMIT ${amount};
    `;

  const percentOut: string[] = [];
  const amountOut: string[] = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);
  const museumItemCount = Object.values(getItems()).filter((i) => i.museum).length;

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

    const formattedName = await formatUsername(
      user.userId,
      user.lastKnownUsername,
      (await getPreferences(user.userId)).leaderboards,
    );

    amountOut[count] = `${pos} ${formattedName} ${user.totalCompleted.toLocaleString()}`;
    percentOut[count] =
      `${pos} ${formattedName} ${((Number(user.totalCompleted) / museumItemCount) * 100).toFixed(1)}%`;

    count++;
  }

  const percentPages = PageManager.createPages(percentOut);
  const amountPages = PageManager.createPages(amountOut);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  checkLeaderboardPositions(userIds, `museum-completion-percent`);

  return { percentPages, amountPages, pos };
}

export async function topMuseumAmount(
  scope: "global",
  guild: undefined,
  item: string,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topMuseumAmount(
  scope: "guild",
  guild: Guild,
  item: string,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topMuseumAmount(
  scope: "guild" | "global",
  guild: Guild | undefined,
  item: string,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);
  const takeAmount = getAmount(guild, amount) || undefined;

  const query = await prisma.museum.findMany({
    where: {
      AND: [
        ...(members ? [{ userId: { in: members } }] : []),
        { itemId: item },
        ...(members ? [{ economy: { user: { blacklisted: false } } }] : []),
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
    ...(takeAmount ? { take: takeAmount } : {}),
  });

  const out: string[] = [];
  const userIds: string[] = [];
  const promises: (() => Promise<void>)[] = [];
  let count = 0;

  for (const user of query) {
    if (user.economy.banned && dayjs().isBefore(user.economy.banned)) continue;

    const index = count++;
    userIds.push(user.userId);
    const pos = getPos(index + 1);

    promises.push(async () => {
      const username = await getUsername(
        user.userId,
        user.economy.user.lastKnownUsername,
        user.economy.user.usernameUpdatedAt,
        guild,
      );

      out[index] =
        `${pos} ${await formatUsername(user.userId, username, scope === "global")} ${user.amount.toLocaleString()} ${pluralize(getItems()[item], user.amount)}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  if (scope === "global") checkLeaderboardPositions(userIds, `museum-amount-item-${item}`);

  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}
