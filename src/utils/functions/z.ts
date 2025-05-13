import { Guild, OverwriteType } from "discord.js";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../Constants";
import { logger } from "../logger";
import sleep from "./sleep";
import { addNotificationToQueue } from "./users/notifications";
import { getLastKnownUsername } from "./users/tag";

export type z = {
  invitedBy: {
    userId: string;
    createdAt: Date;
    hasInvite: boolean;
    removed: boolean;
    rating: number;
    voteKickId: number[];
    invitedById: string | null;
  };
  invitees: {
    userId: string;
    createdAt: Date;
    hasInvite: boolean;
    removed: boolean;
    rating: number;
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

export async function getZProfile(userId: string) {
  const cache = await redis.get(`${Constants.redis.cache.z.profile}:${userId}`);

  if (cache) {
    if (cache === "null") return null;
    return JSON.parse(cache) as z;
  }

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

  await redis.set(
    `${Constants.redis.cache.z.profile}:${userId}`,
    query ? JSON.stringify(query) : "null",
    "EX",
    3600,
  );

  return query;
}

export async function checkZPeoples(guild: Guild) {
  const channel = guild.channels.cache.get(Constants.Z_CHANNEL);

  if (!channel || !channel.isTextBased() || !channel.isSendable() || channel.isThread()) {
    logger.error("z channel not found");
    return;
  }

  for (const overwrite of channel.permissionOverwrites.cache.values()) {
    if (overwrite.type === OverwriteType.Role) continue;

    const profile = await getZProfile(overwrite.id);
    if (!profile || profile.removed) {
      await sleep(250);
      await overwrite.delete();
      continue;
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
    if (!(await guild.members.fetch(userId).catch(() => {}))) continue;
    if (!channel.permissionOverwrites.cache.has(userId)) {
      await sleep(250);
      await channel.permissionOverwrites.create(userId, {
        ViewChannel: true,
      });
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

  await redis.del(
    `${Constants.redis.cache.z.profile}:${userId}`,
    `${Constants.redis.cache.z.profile}:${targetId}`,
  );

  const count = await prisma.z.count({ where: { removed: false } });

  if (target.voteKicks.length + 1 >= count / 5) {
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

  if (query.invitedById) {
    const inviter = await prisma.z.update({
      where: {
        userId: query.invitedById,
      },
      data: {
        rating: { decrement: 1 },
      },
      select: {
        rating: true,
        userId: true,
      },
    });

    if (inviter.rating <= -3) {
      removeZUser(inviter.userId, guild);
    }
  }

  await redis.del(
    `${Constants.redis.cache.z.profile}:${userId}`,
    `${Constants.redis.cache.z.profile}:${query.invitedById}`,
  );

  const channel = guild.channels.cache.get(Constants.Z_CHANNEL);

  if (!channel || !channel.isTextBased() || !channel.isSendable() || channel.isThread()) {
    logger.error("z channel not found");
    return;
  }

  await channel.permissionOverwrites.delete(userId);

  channel.send({
    embeds: [
      new CustomEmbed(userId, `${await getLastKnownUsername(userId)} has been removed from **z**`),
    ],
  });

  addNotificationToQueue({
    memberId: userId,
    payload: {
      embed: new CustomEmbed(userId, "you have been removed from **z**"),
    },
  });
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

  await redis.del(
    `${Constants.redis.cache.z.profile}:${userId}`,
    `${Constants.redis.cache.z.profile}:${targetId}`,
  );

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

  await redis.del(
    `${Constants.redis.cache.z.profile}:${userId}`,
    `${Constants.redis.cache.z.profile}:${targetId}`,
  );

  const channel = await guild.channels.fetch(Constants.Z_CHANNEL);

  if (!channel || !channel.isTextBased() || !channel.isSendable() || channel.isThread()) {
    logger.error("z channel not found");
    return;
  }

  await channel.permissionOverwrites.create(discordTarget, {
    ViewChannel: true,
  });

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
