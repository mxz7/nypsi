import { ClusterManager } from "discord-hybrid-sharding";
import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { findGuildCluster } from "../clusters";
import { formatDate } from "../date";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import dayjs = require("dayjs");
import ms = require("ms");

export async function isPremium(member: GuildMember | string): Promise<boolean> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.premium.LEVEL}:${id}`)) {
    const level = parseInt(await redis.get(`${Constants.redis.cache.premium.LEVEL}:${id}`));

    if (level == 0) {
      return false;
    } else {
      return true;
    }
  }

  const query = await prisma.premium.findUnique({
    where: {
      userId: id,
    },
    select: {
      userId: true,
      level: true,
    },
  });

  if (query) {
    if (query.level == 0) {
      await prisma.premium.delete({
        where: {
          userId: id,
        },
      });
      await redis.set(`${Constants.redis.cache.premium.LEVEL}:${id}`, 0, "EX", ms("1 hour") / 1000);
      return false;
    }

    await redis.set(
      `${Constants.redis.cache.premium.LEVEL}:${id}`,
      query.level,
      "EX",
      ms("1 hour") / 1000,
    );
    return true;
  } else {
    await redis.set(`${Constants.redis.cache.premium.LEVEL}:${id}`, 0, "EX", ms("1 hour") / 1000);
    return false;
  }
}

export async function getTier(member: GuildMember | string): Promise<number> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.premium.LEVEL}:${id}`))
    return parseInt(await redis.get(`${Constants.redis.cache.premium.LEVEL}:${id}`));

  const query = await prisma.premium.findUnique({
    where: {
      userId: id,
    },
    select: {
      level: true,
    },
  });

  await redis.set(
    `${Constants.redis.cache.premium.LEVEL}:${id}`,
    query?.level || 0,
    "EX",
    ms("1 hour") / 1000,
  );

  return query?.level || 0;
}

export async function addMember(member: GuildMember | string, level: number, expires?: Date) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.premium.create({
    data: {
      userId: id,
      level: level,
      startDate: new Date(),
      expireDate: expires || dayjs().add(31, "day").toDate(),
      lastWeekly: new Date(0),
    },
  });

  const profile = await getPremiumProfile(id);

  logger.info(`premium level ${level} given to ${id}`);

  if ((await getDmSettings(id)).premium) {
    addNotificationToQueue({
      memberId: id,
      payload: {
        content: `you have been given **${levelString(
          profile.level,
        )}** membership, this will expire on **${formatDate(
          profile.expireDate,
        )}**\n\nplease join the support server if you have any problems, or questions. ${Constants.NYPSI_SERVER_INVITE_LINK}`,
      },
    });
  }

  await redis.del(`${Constants.redis.cache.premium.LEVEL}:${id}`);
}

export async function getPremiumProfile(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.premium.findUnique({
    where: {
      userId: id,
    },
    include: {
      PremiumCommand: true,
      UserAlias: true,
    },
  });

  return query;
}

export async function setTier(member: GuildMember | string, level: number) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.premium.update({
    where: {
      userId: id,
    },
    data: {
      level: level,
    },
  });

  logger.info(`premium level updated to ${level} for ${id}`);

  if ((await getDmSettings(id)).premium) {
    addNotificationToQueue({
      memberId: id,
      payload: {
        content: `your membership has been updated to **${levelString(level)}**`,
      },
    });
  }

  await redis.del(`${Constants.redis.cache.premium.LEVEL}:${id}`);
}

export async function renewUser(member: string) {
  await prisma.premium.update({
    where: {
      userId: member,
    },
    data: {
      expireDate: dayjs().add(31, "days").toDate(),
    },
  });

  if ((await getDmSettings(member)).premium) {
    addNotificationToQueue({
      memberId: member,
      payload: {
        content: `your membership has been renewed until **${formatDate(
          dayjs().add(31, "days").toDate(),
        )}**`,
      },
    });
  }

  await redis.del(`${Constants.redis.cache.premium.LEVEL}:${member}`);
}

export async function expireUser(member: string, client?: NypsiClient | ClusterManager) {
  logger.info(`expiring ${member}'s premium`);
  const level = await getTier(member);
  await prisma.premiumCommand
    .delete({
      where: {
        owner: member,
      },
    })
    .catch(() => {
      // doesnt need to find one
    });

  await prisma.premium.delete({
    where: {
      userId: member,
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

  await redis.del(`${Constants.redis.cache.premium.LEVEL}:${member}`);

  if (client) {
    const cluster = await findGuildCluster(client, Constants.NYPSI_SERVER_ID);

    await (client instanceof NypsiClient ? client.cluster : client).broadcastEval(
      async (c, { cluster, guildId, memberId, roleId }) => {
        if ((c as NypsiClient).cluster.id !== cluster) return;

        const guild = c.guilds.cache.get(guildId);

        if (!guild) return;

        const member = await guild.members.fetch(memberId);

        if (!member) return;

        await member.roles.remove(roleId);
        const role = guild.roles.cache.find((i) => i.name === "custom");

        if (role) member.roles.remove(role);
      },
      {
        context: { guildId: Constants.NYPSI_SERVER_ID, cluster, memberId: member, roleId },
      },
    );
  }

  if ((await getDmSettings(member)).premium) {
    addNotificationToQueue({
      memberId: member,
      payload: {
        content: `your **${levelString(
          level,
        )}** membership has expired, join the support server if this is an error ($support)`,
      },
    });
  }
}

export async function setExpireDate(member: GuildMember | string, date: Date) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.premium.update({
    where: {
      userId: id,
    },
    data: {
      expireDate: date,
    },
  });

  if ((await getDmSettings(id)).premium) {
    addNotificationToQueue({
      memberId: id,
      payload: { content: `your membership will now expire on **${formatDate(date)}**` },
    });
  }
}

export async function getCredits(id: string) {
  const query = await prisma.premium.findUnique({
    where: { userId: id },
    select: { credit: true },
  });

  return query?.credit || 0;
}

export async function setCredits(id: string, amount: number) {
  await prisma.premium.update({
    where: {
      userId: id,
    },
    data: {
      credit: amount,
    },
  });

  addNotificationToQueue({
    memberId: id,
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
