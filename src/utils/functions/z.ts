import { Guild, OverwriteType } from "discord.js";
import prisma from "../../init/database";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { RedisCache } from "../cache";
import Constants from "../Constants";
import { logger } from "../logger";
import sleep from "./sleep";
import { addNotificationToQueue } from "./users/notifications";
import { getLastKnownUsername } from "./users/username";

export type z = {
  invitedBy: {
    userId: string;
    createdAt: Date;
    hasInvite: boolean;
    removed: boolean;
    voteKickId: number[];
    invitedById: string | null;
  };
  invitees: {
    userId: string;
    createdAt: Date;
    hasInvite: boolean;
    removed: boolean;
    voteKickId: number[];
    invitedById: string | null;
  }[];
  userVoteKicks: { userId: string; createdAt: Date; targetId: string }[];
  voteKicks: { userId: string; createdAt: Date; targetId: string }[];
} & {
  userId: string;
  createdAt: Date;
  hasInvite: boolean;
  removed: boolean;
  rating: number;
  voteKickId: number[];
  invitedById: string | null;
};

const profileCache = new RedisCache<z | false>(Constants.redis.cache.z.profile, 3600);

export async function getZProfile(userId: string): Promise<z | null> {
  const cached = await profileCache.get(userId);

  if (cached !== null) return cached || null;

  const query = await prisma.z.findUnique({
    where: {
      userId,
    },
    include: {
      invitedBy: true,
      invitees: true,
      userVoteKicks: true,
      voteKicks: true,
    },
  });

  if (!query) {
    await profileCache.set(userId, false);
    return null;
  }

  const rating = query.invitees.filter((i) => i.removed).length;

  const z = { ...query, rating: -rating };

  await profileCache.set(userId, z);

  return z;
}

export async function checkZPeoples(guild: Guild) {
  for (const channelId of Constants.Z_CHANNELS) {
    const channel = guild.channels.cache.get(channelId);

    if (!channel || channel.isThread()) {
      logger.error(`z: channel ${channelId} not found`);
      return;
    }

    for (const overwrite of channel.permissionOverwrites.cache.values()) {
      if (overwrite.type === OverwriteType.Role) continue;

      const profile = await getZProfile(overwrite.id);
      if (!profile || profile.removed) {
        await sleep(250);
        await overwrite.delete();
      }
    }

    const users = await prisma.z.findMany({
      where: {
        removed: false,
      },
      select: {
        userId: true,
      },
    });

    for (const { userId } of users) {
      const member = await guild.members.fetch(userId).catch(() => {});

      if (!member) {
        continue;
      }

      if (!channel.permissionOverwrites.cache.has(member.user.id)) {
        logger.debug(`z: adding ${member?.user?.id} to ${channelId}`);
        await sleep(250);
        await channel.permissionOverwrites.create(member, {
          ViewChannel: true,
          Connect: true,
        });
      }
    }
  }
}

export async function castVoteKick(
  userId: string,
  targetId: string,
  guild: Guild,
): Promise<
  | "no user profile"
  | "no target profile"
  | "founding father"
  | "already voted"
  | "kicked"
  | "already removed"
> {
  const user = await getZProfile(userId);
  const target = await getZProfile(targetId);

  if (!user) return "no user profile";
  if (!target) return "no target profile";

  if (!target.invitedById) return "founding father";
  if (user.userVoteKicks.find((i) => i.targetId === targetId)) return "already voted";
  if (user.removed) return "already removed";

  await prisma.zKicks.create({
    data: {
      targetId,
      userId,
    },
  });

  await Promise.all([profileCache.delete(userId), profileCache.delete(targetId)]);

  if (target.voteKicks.length + 1 >= (await getTargetKicks())) {
    removeZUser(targetId, guild);

    return "kicked";
  }

  return "kicked";
}

export async function removeZUser(userId: string, guild: Guild) {
  const query = await prisma.z.update({
    where: {
      userId: userId,
    },
    data: {
      removed: true,
    },
    select: {
      invitedById: true,
    },
  });

  await profileCache.delete(userId);
  if (query.invitedById) await profileCache.delete(query.invitedById);

  for (const channelId of Constants.Z_CHANNELS) {
    const channel = guild.channels.cache.get(channelId);

    if (!channel || channel.isThread()) {
      logger.error(`z: channel ${channelId} not found`);
      return;
    }

    await channel.permissionOverwrites.delete(userId);

    if (Constants.Z_CHANNELS.indexOf(channelId) !== 0 || !channel.isSendable()) {
      continue;
    }

    channel.send({
      embeds: [
        new CustomEmbed(
          userId,
          `${await getLastKnownUsername(userId)} has been removed from **z**`,
        ),
      ],
    });

    addNotificationToQueue({
      memberId: userId,
      payload: {
        embed: new CustomEmbed(
          userId,
          "you have been removed from **z**, please remain civil or you will be removed from the server",
        ),
      },
    });
  }
}

export async function removeVoteKick(userId: string, targetId: string) {
  const user = await getZProfile(userId);
  const target = await getZProfile(targetId);

  if (!user) return "no user profile";
  if (!target) return "no target profile";

  if (!user.userVoteKicks.find((i) => i.targetId === targetId)) return "no vote kick";
  if (target.removed) return "already removed";

  await prisma.zKicks.delete({
    where: {
      userId_targetId: {
        targetId,
        userId,
      },
    },
  });

  await Promise.all([profileCache.delete(userId), profileCache.delete(targetId)]);

  return "removed";
}

export async function invite(userId: string, targetId: string, guild: Guild) {
  const user = await getZProfile(userId);
  const target = await getZProfile(targetId);
  const discordTarget = await guild.members.fetch(targetId).catch(() => {});

  if (!discordTarget) return "target not found";

  if (!user) return "no user profile";
  if (!user.hasInvite) return "no invite";
  if (target) return "target profile";

  await prisma.z.create({
    data: {
      userId: targetId,
      invitedById: userId,
    },
  });
  await prisma.z.update({
    where: {
      userId,
    },
    data: {
      hasInvite: false,
    },
  });

  await Promise.all([profileCache.delete(userId), profileCache.delete(targetId)]);

  for (const channelId of Constants.Z_CHANNELS) {
    const channel = guild.channels.cache.get(channelId);

    if (!channel || channel.isThread()) {
      logger.error(`z: channel ${channelId} not found`);
      return;
    }

    await channel.permissionOverwrites.create(discordTarget, {
      ViewChannel: true,
      Connect: true,
    });

    if (Constants.Z_CHANNELS.indexOf(channelId) !== 0 || !channel.isSendable()) {
      continue;
    }

    channel.send({
      embeds: [
        new CustomEmbed(
          targetId,
          `welcome to **z**\n\n` + "only rule of **z** is: do not talk about z",
        ),
      ],
      content: `<@${targetId}>`,
    });
  }
}

export async function getTargetKicks() {
  const count = await prisma.z.count({ where: { removed: false } });

  return Math.ceil(count / 5);
}
