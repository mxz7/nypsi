import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type BaseMessageOptions,
  type Guild,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { LootPoolResult } from "../../types/LootPool";
import Constants from "../Constants";
import { logger } from "../logger";
import { RedisPubSub } from "../pubsub";
import { formatEventProgress, getCurrentEvent } from "./economy/events";
import { itemExists } from "./economy/inventory";
import { giveLootPoolResult, rollLootPool } from "./economy/loot_pools";
import { createUser, getItems, getLootPools, userExists } from "./economy/utils";
import { getMembers } from "./leaderboards/helpers";
import { getUserId, MemberResolvable } from "./member";

export const CLICK_BUTTON_ID = "btn-click";
const CLICK_SESSION_MONEY = "$money";
const CLICK_SESSION_XP = "$xp";

type ClickEvent = {
  userId: string;
  clicks: number;
  lastClick: string;
};

const clickEvents = new RedisPubSub<ClickEvent>(redis, Constants.redis.pubsub.CLICKS);

type ClickOverview = {
  userClicks: number;
  globalPosition: number | null;
  serverPosition: number | null;
  globalClicks: number;
};

export type ClickSessionRewards = Record<string, number>;

export function buildClickButtonRow(userId: string, label: string, captchaWarning = false) {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CLICK_BUTTON_ID}:${userId}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Primary),
  );

  if (captchaWarning) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("btn-captcha")
        .setLabel("you must complete a captcha")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
        .setEmoji("⚠️"),
    );
  }

  return row;
}

export async function addClick(member: MemberResolvable) {
  const userId = getUserId(member);
  const lastClick = new Date();

  const click = await prisma.clicks.upsert({
    where: { userId },
    create: { userId, clicks: 1, lastClick },
    update: { clicks: { increment: 1 }, lastClick },
  });

  await clickEvents
    .publish({
      userId,
      clicks: click.clicks,
      lastClick: click.lastClick.toISOString(),
    })
    .catch((error) => logger.error("click: failed to publish update", { userId, error }));
}

export async function rollClickLoot(member: MemberResolvable): Promise<LootPoolResult> {
  const userId = getUserId(member);
  const result = await rollLootPool(
    getLootPools().click,
    async (itemId) => getItems()[itemId].unique && (await itemExists(itemId)),
  );

  await giveLootPoolResult(member, result, "click");

  if (Object.keys(result).length > 0) {
    logger.info(`click: rewarded ${userId}`, { userId, reward: result });
  }

  return result;
}

export function parseClickSessionRewards(description?: string): ClickSessionRewards {
  const rewards: ClickSessionRewards = {};
  const session = description?.split("**current session rewards**\n")[1];

  if (!session) return rewards;

  const rewardPattern =
    /(?:\*\*|`)([\d,]+)x(?:\*\*|`) .*?\]\(https:\/\/nypsi\.xyz\/items\/([^)?]+)(?:\?[^)]*)?\)/g;

  for (const match of session.matchAll(rewardPattern)) {
    const count = parseInt(match[1].replaceAll(",", ""));
    const itemId = decodeURIComponent(match[2]);

    if (getItems()[itemId] && count > 0) rewards[itemId] = count;
  }

  const money = /`\$([\d,]+)` money/.exec(session);
  const xp = /`([\d,]+)xp` experience/.exec(session);

  if (money) rewards[CLICK_SESSION_MONEY] = parseInt(money[1].replaceAll(",", ""));
  if (xp) rewards[CLICK_SESSION_XP] = parseInt(xp[1].replaceAll(",", ""));

  return rewards;
}

export function addClickSessionReward(
  rewards: ClickSessionRewards,
  result: LootPoolResult,
): ClickSessionRewards {
  if (result.item) rewards[result.item] = (rewards[result.item] ?? 0) + (result.count ?? 1);
  if (result.money)
    rewards[CLICK_SESSION_MONEY] = (rewards[CLICK_SESSION_MONEY] ?? 0) + result.money;
  if (result.xp) rewards[CLICK_SESSION_XP] = (rewards[CLICK_SESSION_XP] ?? 0) + result.xp;
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
  captchaWarning = false,
  eventProgress?: number,
): Promise<BaseMessageOptions> {
  const userId = getUserId(member);

  const [stats, user] = await Promise.all([
    getClickStats(member, guild),
    guild.client.users.fetch(userId),
  ]);

  const globalPosition = stats.globalPosition?.toLocaleString() ?? "--";
  const serverPosition = stats.serverPosition?.toLocaleString() ?? "--";

  const row = buildClickButtonRow(userId, stats.userClicks.toLocaleString(), captchaWarning);
  const content = captchaWarning ? `<@${userId}>` : "";
  const allowedMentions = { users: captchaWarning ? [userId] : [] };

  if (stats.userClicks === 0) {
    return { content, allowedMentions, components: [row] };
  }

  const session = Object.entries(sessionRewards)
    .map(([itemId, count]) => {
      if (itemId === CLICK_SESSION_MONEY) return `- 💰 $**${count.toLocaleString()}**`;
      if (itemId === CLICK_SESSION_XP) return `- ${count.toLocaleString()}xp`;

      const item = getItems()[itemId];

      return `- \`${count.toLocaleString()}x\` ${item.emoji} [${item.name}](https://nypsi.xyz/items/${item.id}?ref=bot-click)`;
    })
    .join("\n");

  let description =
    `global position: **#${globalPosition}**\n` +
    `server position: **#${serverPosition}**\n` +
    `total global clicks: **${stats.globalClicks.toLocaleString()}**` +
    (session ? `\n\n**current session rewards**\n${session}` : "");

  if (eventProgress) {
    const eventData = await getCurrentEvent();
    description += `\n\n${formatEventProgress(eventData, eventProgress, userId)}`;
  }

  const embed = new CustomEmbed(member)
    .setHeader(`${user.username}`, user.displayAvatarURL())
    .setDescription(description);

  return { content, allowedMentions, embeds: [embed], components: [row] };
}
