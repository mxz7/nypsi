import dayjs = require("dayjs");
import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { getAllMembers } from "../guilds/members";
import { getUserId, MemberResolvable } from "../member";
import PageManager from "../page";
import { pluralize } from "../string";
import { getPreferences } from "../users/notifications";
import { updateLastKnownUsername } from "../users/username";
import { checkLeaderboardPositions } from "../economy/stats";
import { getItems } from "../economy/utils";
import { formatUsername, UPDATE_USERNAME_MS } from "./helpers";
import pAll = require("p-all");

export async function topMuseumCompletion(guild: Guild, item: string, member: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.museum.findMany({
    where: {
      AND: [
        { userId: { in: members } },
        { itemId: item },
        { completedAt: { not: null } },
        { economy: { user: { blacklisted: false } } },
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
  });

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
    if (user.economy.banned && date.isBefore(user.economy.banned)) {
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
      let username = user.economy.user.lastKnownUsername;

      if (user.economy.user.usernameUpdatedAt.getTime() < date.valueOf() - UPDATE_USERNAME_MS) {
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
      )} <t:${Math.floor(new Date(user.completedAt).getTime() / 1000)}:f>`;
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

export async function topMuseumCompletionGlobal(
  item: string,
  member?: MemberResolvable,
  amount = 100,
) {
  const query = await prisma.museum.findMany({
    where: {
      AND: [{ itemId: item }, { completedAt: { not: null } }],
    },
    select: {
      userId: true,
      completedAt: true,
      economy: {
        select: {
          user: {
            select: {
              lastKnownUsername: true,
            },
          },
          banned: true,
        },
      },
    },
    orderBy: [{ completedAt: "asc" }, { economy: { user: { lastKnownUsername: "asc" } } }],
    take: amount,
  });

  const out = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);

  for (const user of query) {
    if (user.economy.banned && dayjs().isBefore(user.economy.banned)) {
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

    out[count] = `${pos} ${await formatUsername(
      user.userId,
      user.economy.user.lastKnownUsername,
      (await getPreferences(user.userId)).leaderboards,
    )} <t:${Math.floor(new Date(user.completedAt).getTime() / 1000)}:f>`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  checkLeaderboardPositions(userIds, `museum-completion-item-${item}`);

  return { pages, pos };
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

export async function topMuseumAmount(guild: Guild, item: string, member: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.museum.findMany({
    where: {
      AND: [
        { userId: { in: members } },
        { itemId: item },
        { economy: { user: { blacklisted: false } } },
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
  });

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
    if (user.economy.banned && date.isBefore(user.economy.banned)) {
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
      let username = user.economy.user.lastKnownUsername;

      if (user.economy.user.usernameUpdatedAt.getTime() < date.valueOf() - UPDATE_USERNAME_MS) {
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
      )} ${user.amount.toLocaleString()} ${pluralize(getItems()[item], user.amount)}`;
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

export async function topMuseumAmountGlobal(item: string, member?: MemberResolvable, amount = 100) {
  const query = await prisma.museum.findMany({
    where: {
      itemId: item,
    },
    select: {
      userId: true,
      amount: true,
      economy: {
        select: {
          user: {
            select: {
              lastKnownUsername: true,
            },
          },
          banned: true,
        },
      },
    },
    orderBy: [{ amount: "desc" }, { economy: { user: { lastKnownUsername: "asc" } } }],
    take: amount,
  });

  const out = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);

  for (const user of query) {
    if (user.economy.banned && dayjs().isBefore(user.economy.banned)) {
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

    out[count] = `${pos} ${await formatUsername(
      user.userId,
      user.economy.user.lastKnownUsername,
      (await getPreferences(user.userId)).leaderboards,
    )} ${user.amount.toLocaleString()} ${pluralize(getItems()[item], user.amount)}`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  checkLeaderboardPositions(userIds, `museum-amount-item-${item}`);

  return { pages, pos };
}

