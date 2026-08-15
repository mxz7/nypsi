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
import { createUser, userExists } from "./economy/utils";
import { getMembers } from "./leaderboards/helpers";
import { getUserId, MemberResolvable } from "./member";

export const CLICK_BUTTON_ID = "btn-click";

type ClickOverview = {
  userClicks: number;
  globalPosition: number | null;
  serverPosition: number | null;
  globalClicks: number;
};

export async function addClick(member: MemberResolvable) {
  const userId = getUserId(member);

  await prisma.clicks.upsert({
    where: { userId },
    create: { userId, clicks: 1 },
    update: { clicks: { increment: 1 } },
  });
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

  const embed = new CustomEmbed(member)
    .setHeader(`${user.username}`, user.displayAvatarURL())
    .setDescription(
      `global position: **#${globalPosition}**\n` +
        `server position: **#${serverPosition}**\n` +
        `total global clicks: **${stats.globalClicks.toLocaleString()}**`,
    );

  return { embeds: [embed], components: [row] };
}
