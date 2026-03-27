import dayjs = require("dayjs");
import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { checkLeaderboardPositions } from "../economy/stats";
import { getAllMembers } from "../guilds/members";
import { getUserId, MemberResolvable } from "../member";
import PageManager from "../page";
import { pluralize } from "../string";
import { getPreferences } from "../users/notifications";
import { getLastKnownUsername, updateLastKnownUsername } from "../users/username";
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
      )} ${user.uses.toLocaleString()} ${pluralize("use", user.uses)}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  if (scope === "global") {
    checkLeaderboardPositions(userIds, "commands");
  }

  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}

export async function topCommandUses(guild: Guild, member: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query = await prisma.commandUse.groupBy({
    where: {
      AND: [{ userId: { in: members } }],
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
      const usernameData = await getLastKnownUsername(user.userId, false, true);

      let username = usernameData.lastKnownUsername;

      if (usernameData.usernameUpdatedAt.getTime() < date.valueOf() - UPDATE_USERNAME_MS) {
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
      )} ${user._sum.uses.toLocaleString()} ${pluralize("command", user._sum.uses)}`;
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

export async function topCommandUsesGlobal(member?: MemberResolvable) {
  const query = await prisma.commandUse.groupBy({
    by: ["userId"],
    _sum: {
      uses: true,
    },
    orderBy: {
      _sum: {
        uses: "desc",
      },
    },
    take: 100,
  });

  const out = [];

  let count = 0;

  const userIds = query.map((i) => i.userId);

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

    out[count] = `${pos} ${await formatUsername(
      user.userId,
      await getLastKnownUsername(user.userId, false),
      (await getPreferences(user.userId)).leaderboards,
    )} ${user._sum.uses.toLocaleString()} ${pluralize("command", user._sum.uses)}`;

    count++;
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = userIds.indexOf(getUserId(member)) + 1;
  }

  return { pages, pos };
}
