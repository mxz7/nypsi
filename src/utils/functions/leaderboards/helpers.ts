import { Guild } from "discord.js";
import { getAllMembers } from "../guilds/members";
import PageManager from "../page";
import { getPreferences } from "../users/notifications";
import { getActiveTag } from "../users/tags";
import { updateLastKnownUsername } from "../users/username";
import { getTagsData } from "../economy/utils";
import ms = require("ms");

export const UPDATE_USERNAME_MS = ms("3 weeks");

export async function formatUsername(id: string, username: string, checkPrivacy: boolean) {
  if (checkPrivacy) {
    const privacy = (await getPreferences(id)).leaderboards;

    if (!privacy) {
      return "[**[hidden]**](https://nypsi.xyz/wiki/economy/user-settings/hidden?ref=bot-lb)";
    }
  }

  let out = `[**${username}**](https://nypsi.xyz/users/${encodeURIComponent(id)}?ref=bot-lb)`;

  const tag = await getActiveTag(id);

  if (tag) out = `[${getTagsData()[tag.tagId].emoji}] ${out}`;

  return out;
}

export async function getMembers(guild?: Guild) {
  if (!guild) return null;

  const members = await getAllMembers(guild);

  return members;
}

export async function getUsername(
  userId: string,
  lastKnownUsername: string,
  lastUpdatedUsername: Date,
  guild?: Guild,
) {
  let username = lastKnownUsername;

  if (guild && lastUpdatedUsername.getTime() < Date.now() - UPDATE_USERNAME_MS) {
    const discordUser = await guild.client.users.fetch(userId).catch(() => {});
    if (discordUser) {
      username = discordUser.username;
      updateLastKnownUsername(userId, username);
    }
  }

  return username;
}

export function getPos(index: number) {
  switch (index) {
    case 1:
      return "🥇";
    case 2:
      return "🥈";
    case 3:
      return "🥉";
    default:
      return `${index}.`;
  }
}

export function createLeaderboardOutput(out: string[], userIds: string[], userId?: string) {
  return { pages: PageManager.createPages(out), pos: userId ? userIds.indexOf(userId) + 1 : 0 };
}

export function getAmount(guild?: Guild, amount?: number) {
  if (amount) return amount;
  if (!guild) return 100;
  return undefined;
}

export type LeaderboardResult = ReturnType<typeof createLeaderboardOutput>;
