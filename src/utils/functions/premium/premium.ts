import { ClusterManager } from "discord-hybrid-sharding";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import Constants from "../../Constants";
import { clearExpiredUserAliases } from "../../handlers/commandhandler";
import { logger } from "../../logger";
import { findGuildCluster } from "../clusters";
import { formatDate } from "../date";
import { getUserId, MemberResolvable } from "../member";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { getLastKnownUsername } from "../users/username";
import { removeUserAlias } from "./aliases";
import dayjs = require("dayjs");
import ms = require("ms");

export async function isPremium(member: MemberResolvable): Promise<boolean> {
  const userId = getUserId(member);

  if (await redis.exists(`${Constants.redis.cache.premium.LEVEL}:${userId}`)) {
    const level = parseInt(await redis.get(`${Constants.redis.cache.premium.LEVEL}:${userId}`));

    if (level == 0) {
      return false;
    } else {
      return true;
    }
  }

  const query = await prisma.premium.findUnique({
    where: {
      userId,
    },
    select: {
      userId: true,
      level: true,
    },
  });

  if (query) {
    if (query.level == 0) {
      await redis.set(
        `${Constants.redis.cache.premium.LEVEL}:${userId}`,
        0,
        "EX",
        ms("1 hour") / 1000,
      );
      return false;
    }

    await redis.set(
      `${Constants.redis.cache.premium.LEVEL}:${userId}`,
      query.level,
      "EX",
      ms("1 hour") / 1000,
    );
    return true;
  } else {
    await redis.set(
      `${Constants.redis.cache.premium.LEVEL}:${userId}`,
      0,
      "EX",
      ms("1 hour") / 1000,
    );
    return false;
  }
}

export async function getTier(member: MemberResolvable): Promise<number> {
  const userId = getUserId(member);

  if (await redis.exists(`${Constants.redis.cache.premium.LEVEL}:${userId}`))
    return parseInt(await redis.get(`${Constants.redis.cache.premium.LEVEL}:${userId}`));

  const query = await prisma.premium.findUnique({
    where: {
      userId,
    },
    select: {
      level: true,
    },
  });

  await redis.set(
    `${Constants.redis.cache.premium.LEVEL}:${userId}`,
    query?.level || 0,
    "EX",
    ms("1 hour") / 1000,
  );

  return query?.level || 0;
}

export async function addMember(member: MemberResolvable, level: number, expires?: Date) {
  const userId = getUserId(member);

  await prisma.premium.upsert({
    where: {
      userId,
    },
    create: {
      userId,
      level: level,
      startDate: new Date(),
      expireDate: expires || dayjs().add(31, "day").toDate(),
    },
    update: {
      level: level,
      startDate: new Date(),
      expireDate: expires || dayjs().add(31, "day").toDate(),
    },
  });

  let max = 3;

  for (let i = 0; i < level; i++) {
    max *= 1.75;
    if (i === 3) max *= 2;
  }

  max = Math.floor(max);

  const profile = await getPremiumProfile(userId);

  if (profile.UserAlias.length > max) {
    const toRemove = profile.UserAlias.slice(max);
    for (const alias of toRemove) {
      await removeUserAlias(userId, alias.alias);
    }
  }

  logger.info(`premium level ${level} given to ${userId}`);

  if ((await getDmSettings(userId)).premium) {
    addNotificationToQueue({
      memberId: userId,
      payload: {
        content: `you have been given **${levelString(
          profile.level,
        )}** membership, this will expire on **${formatDate(
          profile.expireDate,
        )}**\n\nplease join the support server if you have any problems, or questions. ${Constants.NYPSI_SERVER_INVITE_LINK}`,
      },
    });
  }

  await redis.del(`${Constants.redis.cache.premium.LEVEL}:${userId}`);
  await redis.del(`${Constants.redis.cache.premium.ALIASES}:${userId}`);
}

export async function getPremiumProfile(member: MemberResolvable) {
  const query = await prisma.premium.findUnique({
    where: {
      userId: getUserId(member),
    },
    include: {
      PremiumCommand: true,
      UserAlias: true,
    },
  });

  return query;
}

export async function setTier(member: MemberResolvable, level: number) {
  const userId = getUserId(member);

  await prisma.premium.update({
    where: {
      userId,
    },
    data: {
      level: level,
    },
  });

  logger.info(`premium level updated to ${level} for ${userId}`);

  if ((await getDmSettings(userId)).premium) {
    addNotificationToQueue({
      memberId: userId,
      payload: {
        content: `your membership has been updated to **${levelString(level)}**`,
      },
    });
  }

  await redis.del(`${Constants.redis.cache.premium.LEVEL}:${userId}`);
}

export async function renewUser(member: MemberResolvable) {
  const userId = getUserId(member);

  await prisma.premium.update({
    where: {
      userId,
    },
    data: {
      expireDate: dayjs().add(31, "days").toDate(),
    },
  });

  if ((await getDmSettings(member)).premium) {
    addNotificationToQueue({
      memberId: userId,
      payload: {
        content: `your membership has been renewed until **${formatDate(
          dayjs().add(31, "days").toDate(),
        )}**`,
      },
    });
  }

  await redis.del(`${Constants.redis.cache.premium.LEVEL}:${userId}`);
}

export async function expireUser(member: MemberResolvable, client?: NypsiClient | ClusterManager) {
  const userId = getUserId(member);
  logger.info(`expiring ${userId}'s premium`);
  const level = await getTier(member);

  await prisma.premium.update({
    where: {
      userId,
    },
    data: {
      level: 0,
    },
  });

  let roleId: string;

  switch (level) {
    case 1:
      roleId = "819870590718181391";
      break;
    case 2:
      roleId = "819870727834566696";
      break;
    case 3:
      roleId = "819870846536646666";
      break;
    case 4:
      roleId = "819870959325413387";
      break;
  }

  await redis.del(`${Constants.redis.cache.premium.LEVEL}:${userId}`);
  await redis.del(`${Constants.redis.cache.premium.ALIASES}:${userId}`);

  clearExpiredUserAliases(await getLastKnownUsername(userId, false));

  if (client) {
    const cluster = await findGuildCluster(client, Constants.NYPSI_SERVER_ID);

    await (client instanceof NypsiClient ? client.cluster : client)
      .broadcastEval(
        async (c, { cluster, guildId, userId, roleId }) => {
          if ((c as NypsiClient).cluster.id !== cluster) return;

          const guild = c.guilds.cache.get(guildId);

          if (!guild) return;

          const member = await guild.members.fetch(userId).catch(() => {});

          if (!member) return;

          await member.roles.remove(roleId);
          const role = guild.roles.cache.find((i) => i.name === "custom");

          if (role) member.roles.remove(role);
        },
        {
          context: { guildId: Constants.NYPSI_SERVER_ID, cluster, userId, roleId },
        },
      )
      .catch(() => {
        logger.warn("premium expire failed to remove role", { userId: member });
      });
  }

  if ((await getDmSettings(member)).premium) {
    addNotificationToQueue({
      memberId: getUserId(member),
      payload: {
        content: `your **${levelString(
          level,
        )}** membership has expired, join the support server if this is an error ($support)`,
      },
    });
  }
}

export async function setExpireDate(member: MemberResolvable, date: Date) {
  const userId = getUserId(member);

  await prisma.premium.update({
    where: {
      userId,
    },
    data: {
      expireDate: date,
    },
  });

  if ((await getDmSettings(userId)).premium) {
    addNotificationToQueue({
      memberId: userId,
      payload: { content: `your membership will now expire on **${formatDate(date)}**` },
    });
  }
}

export async function getCredits(member: MemberResolvable) {
  const query = await prisma.premium.findUnique({
    where: { userId: getUserId(member) },
    select: { credit: true },
  });

  return query?.credit || 0;
}

export async function setCredits(member: MemberResolvable, amount: number) {
  const userId = getUserId(member);

  await prisma.premium.update({
    where: {
      userId,
    },
    data: {
      credit: amount,
    },
  });

  addNotificationToQueue({
    memberId: userId,
    payload: {
      content: `you now have **${amount}** premium credits\n\ncredits will be used automatically once the expire date has elapsed. if your tier changes, you will lose your credits`,
    },
  });
}

export function levelString(level: number) {
  const map = new Map([
    [1, "bronze"],
    [2, "silver"],
    [3, "gold"],
    [4, "platinum"],
  ]);

  return map.get(level) || "invalid";
}
