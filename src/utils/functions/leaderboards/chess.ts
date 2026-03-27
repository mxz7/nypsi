import dayjs = require("dayjs");
import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { getAllMembers } from "../guilds/members";
import { getUserId, MemberResolvable } from "../member";
import PageManager from "../page";
import { formatTime, pluralize } from "../string";
import { getLastKnownUsername, updateLastKnownUsername } from "../users/username";
import { formatUsername, UPDATE_USERNAME_MS } from "./helpers";
import pAll = require("p-all");

export async function topChessSolved(guild: Guild, member: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.chessPuzzleStats.findMany({
    where: {
      AND: [{ userId: { in: members } }, { solved: { gt: 0 } }, { user: { blacklisted: false } }],
    },
    orderBy: { solved: "desc" },
    select: { userId: true, solved: true },
  });

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
    const currentCount = count;
    let pos = (count + 1).toString();

    if (pos == "1") pos = "🥇";
    else if (pos == "2") pos = "🥈";
    else if (pos == "3") pos = "🥉";
    else pos += ".";

    count++;

    promises.push(async () => {
      const usernameData = await getLastKnownUsername(user.userId, false, true);
      let username = usernameData.lastKnownUsername;

      if (usernameData.usernameUpdatedAt.getTime() < date.valueOf() - UPDATE_USERNAME_MS) {
        const discordUser = await guild.client.users.fetch(user.userId).catch(() => {});
        if (discordUser) {
          username = discordUser.username;
          await updateLastKnownUsername(user.userId, username);
        }
      }

      out[currentCount] =
        `${pos} ${await formatUsername(user.userId, username, true)} ${user.solved.toLocaleString()} ${pluralize("solve", user.solved)}`;
    });
  }

  await pAll(promises, { concurrency: 10 });
  const pages = PageManager.createPages(out);
  let pos = 0;
  if (member) pos = userIds.indexOf(getUserId(member)) + 1;
  return { pages, pos };
}

export async function topChessSolvedGlobal(member: MemberResolvable) {
  const query = await prisma.chessPuzzleStats.findMany({
    where: { AND: [{ solved: { gt: 0 } }, { user: { blacklisted: false } }] },
    orderBy: { solved: "desc" },
    select: { userId: true, solved: true },
    take: 100,
  });

  const out: string[] = [];

  for (const user of query) {
    let pos = (out.length + 1).toString();
    if (pos == "1") pos = "🥇";
    else if (pos == "2") pos = "🥈";
    else if (pos == "3") pos = "🥉";
    else pos += ".";

    out.push(
      `${pos} ${await formatUsername(
        user.userId,
        await getLastKnownUsername(user.userId, false),
        true,
      )} ${user.solved.toLocaleString()} ${pluralize("solve", user.solved)}`,
    );
  }

  const pages = PageManager.createPages(out);
  let pos = 0;
  if (member) pos = query.findIndex((i) => i.userId === getUserId(member)) + 1;
  return { pages, pos };
}

export async function topChessAvgRating(guild: Guild, member: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.chessPuzzleStats.findMany({
    where: {
      AND: [
        { userId: { in: members } },
        { solved: { gt: 0 } },
        { averageWinningRating: { gt: 0 } },
        { user: { blacklisted: false } },
      ],
    },
    orderBy: { averageWinningRating: "desc" },
    select: { userId: true, averageWinningRating: true },
  });

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
    const currentCount = count;
    let pos = (count + 1).toString();

    if (pos == "1") pos = "🥇";
    else if (pos == "2") pos = "🥈";
    else if (pos == "3") pos = "🥉";
    else pos += ".";

    count++;

    promises.push(async () => {
      const usernameData = await getLastKnownUsername(user.userId, false, true);
      let username = usernameData.lastKnownUsername;

      if (usernameData.usernameUpdatedAt.getTime() < date.valueOf() - UPDATE_USERNAME_MS) {
        const discordUser = await guild.client.users.fetch(user.userId).catch(() => {});
        if (discordUser) {
          username = discordUser.username;
          await updateLastKnownUsername(user.userId, username);
        }
      }

      out[currentCount] =
        `${pos} ${await formatUsername(user.userId, username, true)} avg \`${Math.round(user.averageWinningRating).toLocaleString()}\` rating`;
    });
  }

  await pAll(promises, { concurrency: 10 });
  const pages = PageManager.createPages(out);
  let pos = 0;
  if (member) pos = userIds.indexOf(getUserId(member)) + 1;
  return { pages, pos };
}

export async function topChessAvgRatingGlobal(member: MemberResolvable) {
  const query = await prisma.chessPuzzleStats.findMany({
    where: {
      AND: [
        { solved: { gt: 0 } },
        { averageWinningRating: { gt: 0 } },
        { user: { blacklisted: false } },
      ],
    },
    orderBy: { averageWinningRating: "desc" },
    select: { userId: true, averageWinningRating: true },
    take: 100,
  });

  const out: string[] = [];

  for (const user of query) {
    let pos = (out.length + 1).toString();
    if (pos == "1") pos = "🥇";
    else if (pos == "2") pos = "🥈";
    else if (pos == "3") pos = "🥉";
    else pos += ".";

    out.push(
      `${pos} ${await formatUsername(
        user.userId,
        await getLastKnownUsername(user.userId, false),
        true,
      )} avg \`${Math.round(user.averageWinningRating).toLocaleString()}\` rating`,
    );
  }

  const pages = PageManager.createPages(out);
  let pos = 0;
  if (member) pos = query.findIndex((i) => i.userId === getUserId(member)) + 1;
  return { pages, pos };
}

export async function topChessFastestSolve(guild: Guild, member: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.chessPuzzleStats.findMany({
    where: {
      AND: [
        { userId: { in: members } },
        { fastestSolve: { not: null } },
        { user: { blacklisted: false } },
      ],
    },
    orderBy: { fastestSolve: "asc" },
    select: { userId: true, fastestSolve: true },
  });

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
    const currentCount = count;
    let pos = (count + 1).toString();

    if (pos == "1") pos = "🥇";
    else if (pos == "2") pos = "🥈";
    else if (pos == "3") pos = "🥉";
    else pos += ".";

    count++;

    promises.push(async () => {
      const usernameData = await getLastKnownUsername(user.userId, false, true);
      let username = usernameData.lastKnownUsername;

      if (usernameData.usernameUpdatedAt.getTime() < date.valueOf() - UPDATE_USERNAME_MS) {
        const discordUser = await guild.client.users.fetch(user.userId).catch(() => {});
        if (discordUser) {
          username = discordUser.username;
          await updateLastKnownUsername(user.userId, username);
        }
      }

      out[currentCount] =
        `${pos} ${await formatUsername(user.userId, username, true)} \`${formatTime(user.fastestSolve)}\``;
    });
  }

  await pAll(promises, { concurrency: 10 });
  const pages = PageManager.createPages(out);
  let pos = 0;
  if (member) pos = userIds.indexOf(getUserId(member)) + 1;
  return { pages, pos };
}

export async function topChessFastestSolveGlobal(member: MemberResolvable) {
  const query = await prisma.chessPuzzleStats.findMany({
    where: {
      AND: [{ fastestSolve: { not: null } }, { user: { blacklisted: false } }],
    },
    orderBy: { fastestSolve: "asc" },
    select: { userId: true, fastestSolve: true },
    take: 100,
  });

  const out: string[] = [];

  for (const user of query) {
    let pos = (out.length + 1).toString();
    if (pos == "1") pos = "🥇";
    else if (pos == "2") pos = "🥈";
    else if (pos == "3") pos = "🥉";
    else pos += ".";

    out.push(
      `${pos} ${await formatUsername(
        user.userId,
        await getLastKnownUsername(user.userId, false),
        true,
      )} \`${formatTime(user.fastestSolve)}\``,
    );
  }

  const pages = PageManager.createPages(out);
  let pos = 0;
  if (member) pos = query.findIndex((i) => i.userId === getUserId(member)) + 1;
  return { pages, pos };
}
