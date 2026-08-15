import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type BaseMessageOptions,
  type Guild,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import prisma from "../../init/database";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { LootPoolResult } from "../../types/LootPool";
import { itemExists } from "./economy/inventory";
import { giveLootPoolResult, rollLootPool } from "./economy/loot_pools";
import { createUser, getItems, getLootPools, userExists } from "./economy/utils";
import { getMembers } from "./leaderboards/helpers";
import { getUserId, MemberResolvable } from "./member";

export const CLICK_BUTTON_ID = "btn-click";

type ClickOverview = {
  userClicks: number;
  globalPosition: number | null;
  serverPosition: number | null;
  globalClicks: number;
};

export type ClickSessionRewards = Record<string, number>;

export async function addClick(member: MemberResolvable) {
  const userId = getUserId(member);

  await prisma.clicks.upsert({
    where: { userId },
    create: { userId, clicks: 1 },
    update: { clicks: { increment: 1 } },
  });
}

export async function rollClickLoot(member: MemberResolvable): Promise<LootPoolResult> {
  const result = await rollLootPool(
    getLootPools().click,
    async (itemId) => getItems()[itemId].unique && (await itemExists(itemId)),
  );

  await giveLootPoolResult(member, result, "click");
  return result;
}

export function parseClickSessionRewards(description?: string): ClickSessionRewards {
  const rewards: ClickSessionRewards = {};
  const session = description?.split("**current session rewards**\n")[1];

  if (!session) return rewards;

  const rewardPattern =
    /\*\*([\d,]+)x\*\* .*?\]\(https:\/\/nypsi\.xyz\/items\/([^)?]+)(?:\?[^)]*)?\)/g;

  for (const match of session.matchAll(rewardPattern)) {
    const count = parseInt(match[1].replaceAll(",", ""));
    const itemId = decodeURIComponent(match[2]);

    if (getItems()[itemId] && count > 0) rewards[itemId] = count;
  }

  return rewards;
}

export function addClickSessionReward(
  rewards: ClickSessionRewards,
  result: LootPoolResult,
): ClickSessionRewards {
  if (result.item) rewards[result.item] = (rewards[result.item] ?? 0) + (result.count ?? 1);
  return rewards;
}

export async function getClickStats(
  member: MemberResolvable,
  guild: Guild,
): Promise<ClickOverview> {
  const userId = getUserId(member);

  if (!(await userExists(member))) {
    await createUser(member);
  }

  const [userStats, globalClicks, members] = await Promise.all([
    prisma.clicks.findUnique({ where: { userId }, select: { clicks: true } }),
    prisma.clicks.aggregate({ _sum: { clicks: true } }),
    getMembers(guild),
  ]);

  const [usersAheadGlobally, usersAheadInServer] = await Promise.all([
    userStats
      ? prisma.clicks.count({ where: { clicks: { gt: userStats.clicks } } })
      : Promise.resolve(null),
    userStats
      ? prisma.clicks.count({
          where: { userId: { in: members }, clicks: { gt: userStats.clicks } },
        })
      : Promise.resolve(null),
  ]);

  return {
    userClicks: userStats?.clicks ?? 0,
    globalPosition: usersAheadGlobally === null ? null : usersAheadGlobally + 1,
    serverPosition: usersAheadInServer === null ? null : usersAheadInServer + 1,
    globalClicks: globalClicks._sum.clicks ?? 0,
  };
}

export async function buildClickMessage(
  member: MemberResolvable,
  guild: Guild,
  sessionRewards: ClickSessionRewards = {},
): Promise<BaseMessageOptions> {
  const userId = getUserId(member);

  const [stats, user] = await Promise.all([
    getClickStats(member, guild),
    guild.client.users.fetch(userId),
  ]);

  const globalPosition = stats.globalPosition?.toLocaleString() ?? "--";
  const serverPosition = stats.serverPosition?.toLocaleString() ?? "--";

  const button = new ButtonBuilder()
    .setCustomId(`${CLICK_BUTTON_ID}:${userId}`)
    .setLabel(stats.userClicks.toLocaleString())
    .setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(button);

  if (stats.userClicks === 0) {
    return { components: [row] };
  }

  const session = Object.entries(sessionRewards)
    .map(([itemId, count]) => {
      const item = getItems()[itemId];

      return `**${count.toLocaleString()}x** ${item.emoji} [${item.name}](https://nypsi.xyz/items/${item.id}?ref=bot-click)`;
    })
    .join("\n");

  const embed = new CustomEmbed(member)
    .setHeader(`${user.username}`, user.displayAvatarURL())
    .setDescription(
      `global position: **#${globalPosition}**\n` +
        `server position: **#${serverPosition}**\n` +
        `total global clicks: **${stats.globalClicks.toLocaleString()}**` +
        (session ? `\n\n**current session rewards**\n${session}` : ""),
    );

  return { embeds: [embed], components: [row] };
}
