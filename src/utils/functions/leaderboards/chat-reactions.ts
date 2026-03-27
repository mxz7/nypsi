import dayjs = require("dayjs");
import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { getAllMembers } from "../guilds/members";
import { getUserId, MemberResolvable } from "../member";
import PageManager from "../page";
import { getPreferences } from "../users/notifications";
import { updateLastKnownUsername } from "../users/username";
import { checkLeaderboardPositions } from "../economy/stats";
import { formatUsername, UPDATE_USERNAME_MS } from "./helpers";
import pAll = require("p-all");

export async function topChatReaction(guild: Guild, daily: boolean, member?: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.chatReactionLeaderboards.findMany({
    where: {
      AND: [
        { daily: daily },
        { userId: { in: members } },
        { user: { blacklisted: false } },
        {
          OR: [
            { user: { Economy: { banned: null } } },
            { user: { Economy: { banned: { lt: new Date() } } } },
          ],
        },
      ],
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
  });

  const out: string[] = [];
  let count = 0;
  const userIds = query.map((i) => i.userId);
  const promises: (() => Promise<void>)[] = [];
  const date = dayjs();

  for (const user of query) {
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
      let username = user.user.lastKnownUsername;

      if (user.user.usernameUpdatedAt.getTime() < date.valueOf() - UPDATE_USERNAME_MS) {
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
      )} \`${user.time.toFixed(3)}s\` <t:${Math.floor(user.createdAt.getTime() / 1000)}:${dayjs(user.createdAt).isAfter(dayjs().subtract(1, "day")) ? "R" : "D"}>`;
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

export function topChatReactionGlobal(
  member: MemberResolvable,
  daily: boolean,
  amount: number,
  posOnly: true,
): Promise<number>;

export function topChatReactionGlobal(
  member: MemberResolvable,
  daily: boolean,
  amount?: number,
  posOnly?: false,
): Promise<{ pages: Map<number, string[]>; pos: number }>;

export async function topChatReactionGlobal(
  member: MemberResolvable,
  daily: boolean,
  amount = 100,
  posOnly = false,
): Promise<number | { pages: Map<number, string[]>; pos: number }> {
  const userId = getUserId(member);

  const query = await prisma.chatReactionLeaderboards.findMany({
    where: {
      AND: [
        { daily: daily },
        { user: { blacklisted: false } },
        {
          OR: [
            { user: { Economy: { banned: null } } },
            { user: { Economy: { banned: { lt: new Date() } } } },
          ],
        },
      ],
    },
    select: {
      userId: true,
      time: true,
      createdAt: true,
      user: {
        select: {
          lastKnownUsername: true,
        },
      },
    },
    orderBy: [{ time: "asc" }, { user: { lastKnownUsername: "asc" } }],
    take: amount,
  });

  if (posOnly) {
    return query.findIndex((i) => i.userId === userId);
  }

  const usersFinal = [];

  let count = 0;

  for (const user of query) {
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

    usersFinal[count] = `${pos} ${await formatUsername(
      user.userId,
      user.user.lastKnownUsername,
      (await getPreferences(user.userId)).leaderboards,
    )} \`${user.time.toFixed(3)}s\` <t:${Math.floor(user.createdAt.getTime() / 1000)}:${dayjs(user.createdAt).isAfter(dayjs().subtract(1, "day")) ? "R" : "D"}>`;

    count++;
  }

  checkLeaderboardPositions(
    query.map((i) => i.userId),
    `chatreaction_${daily ? "daily" : "global"}`,
  );

  const pages = PageManager.createPages(usersFinal);

  let pos = 0;

  if (userId) {
    pos = query.map((i) => i.userId).indexOf(userId) + 1;
  }

  return { pages, pos };
}

