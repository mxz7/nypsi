import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { checkLeaderboardPositions } from "../economy/stats";
import { getUserId, MemberResolvable } from "../member";
import { pluralize } from "../string";
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

export async function topClicks(
  scope: "global",
  guild: undefined,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topClicks(
  scope: "guild",
  guild: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult>;
export async function topClicks(
  scope: "guild" | "global",
  guild?: Guild,
  member?: MemberResolvable,
  amount?: number,
): Promise<LeaderboardResult> {
  const members = await getMembers(guild);

  const query = await prisma.clicks.findMany({
    where: {
      AND: [{ clicks: { gt: 0 } }, members ? { userId: { in: members } } : undefined].filter(
        Boolean,
      ),
    },
    select: {
      userId: true,
      clicks: true,
      user: {
        select: {
          user: {
            select: {
              lastKnownUsername: true,
              usernameUpdatedAt: true,
            },
          },
        },
      },
    },
    orderBy: [{ clicks: "desc" }, { user: { user: { lastKnownUsername: "asc" } } }],
    take: getAmount(guild, amount) || undefined,
  });

  const out: string[] = [];
  const userIds = query.map((entry) => entry.userId);
  const promises = query.map((entry, index) => async () => {
    const username = getUsername(
      entry.userId,
      entry.user.user.lastKnownUsername,
      entry.user.user.usernameUpdatedAt,
      guild,
    );

    out[index] = `${getPos(index + 1)} ${await formatUsername(
      entry.userId,
      username,
      scope === "global",
    )} ${entry.clicks.toLocaleString()} ${pluralize("click", entry.clicks)}`;
  });

  await pAll(promises, { concurrency: 10 });

  if (scope === "global") checkLeaderboardPositions(userIds, "clicks");

  return createLeaderboardOutput(out, userIds, member ? getUserId(member) : undefined);
}
