import dayjs = require("dayjs");
import { Prisma } from "#generated/prisma";
import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { checkLeaderboardPositions } from "../economy/stats";
import { getAllMembers } from "../guilds/members";
import { getUserId, MemberResolvable } from "../member";
import PageManager from "../page";
import { formatTime, pluralize } from "../string";
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

export async function topWordle(
  scope: "global",
  guild: undefined,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topWordle(
  scope: "guild",
  guild: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topWordle(
  scope: "guild" | "global",
  guild?: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const query = await prisma.wordleGame.groupBy({
    by: ["userId"],
    _count: { userId: true },
    orderBy: { _count: { userId: "desc" } },
    where: {
      AND: [{ won: true }, members ? { userId: { in: members } } : undefined].filter(Boolean),
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
      const usernameData = await getLastKnownUsername(user.userId, false, true);
      const username = await getUsername(
        user.userId,
        usernameData.lastKnownUsername,
        usernameData.usernameUpdatedAt,
        guild,
      );

      out[index] =
        `${pos} ${await formatUsername(user.userId, username, scope === "global")} ${user._count.userId.toLocaleString()} ${pluralize("win", user._count.userId)}`;
    });
  }

  await pAll(promises, { concurrency: 10 });

  if (scope === "global") checkLeaderboardPositions(userIds, "wordle");

  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}

export async function topWordleTime(guild: Guild, member: MemberResolvable) {
  const members = await getAllMembers(guild);

  const query: { userId: string; time: number; gameId: number }[] =
    await prisma.$queryRaw`WITH ranked_results AS (
      SELECT 
          "userId", 
          time AS time, 
          "WordleGame"."id" as "gameId", 
          ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY time ASC) AS rank
      FROM "WordleGame"
      where won = true and "userId" IN (${Prisma.join(members)}) and time > 0
  )
  SELECT "userId", time, "gameId"
  FROM ranked_results
  WHERE rank = 1
  ORDER BY time ASC limit 1000`;

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
      )} [\`${formatTime(user.time)}\`](https://nypsi.xyz/wordles/${user.gameId?.toString(36)}?ref=bot-lb)`;
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

export async function topWordleTimeGlobal(member?: MemberResolvable) {
  const query: { userId: string; time: number; gameId: number }[] =
    await prisma.$queryRaw`WITH ranked_results AS (
    SELECT 
        "userId", 
        time, 
        "WordleGame"."id" as "gameId", 
        ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY time ASC) AS rank
    FROM "WordleGame"
    where won = true and time > 0
)
SELECT "userId", time, "gameId"
FROM ranked_results
WHERE rank = 1
ORDER BY time ASC limit 100`;

  const out: string[] = [];

  for (const user of query) {
    let pos = (out.length + 1).toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    } else {
      pos += ".";
    }

    out.push(
      `${pos} ${await formatUsername(
        user.userId,
        await getLastKnownUsername(user.userId, false),
        true,
      )} [\`${formatTime(user.time)}\`](https://nypsi.xyz/wordles/${user.gameId?.toString(36)}?ref=bot-lb)`,
    );
  }

  const pages = PageManager.createPages(out);

  let pos = 0;

  if (member) {
    pos = query.findIndex((i) => i.userId === getUserId(member)) + 1;
  }

  checkLeaderboardPositions(
    query.map((i) => i.userId),
    "wordle-time",
  );

  return { pages, pos };
}
