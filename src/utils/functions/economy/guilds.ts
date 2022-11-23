import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { GuildUpgradeRequirements } from "../../../types/Economy";
import { NotificationPayload } from "../../../types/Notification";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { addInventoryItem } from "./inventory";
import ms = require("ms");

export async function getGuildByName(name: string) {
  const guild = await prisma.economyGuild
    .findMany({
      where: {
        guildName: {
          mode: "insensitive",
          equals: name,
        },
      },
      include: {
        owner: true,
        members: {
          include: {
            user: {
              select: {
                lastKnownTag: true,
              },
            },
          },
        },
      },
    })
    .then((r) => r[0]);

  return guild;
}

export async function getGuildByUser(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  let guildName: string;

  if (await redis.exists(`${Constants.redis.cache.economy.GUILD_USER}:${id}`)) {
    guildName = await redis.get(`${Constants.redis.cache.economy.GUILD_USER}:${id}`);

    if (guildName == "noguild") return undefined;
  } else {
    const query = await prisma.economyGuildMember.findUnique({
      where: {
        userId: id,
      },
      select: {
        guild: {
          include: {
            owner: true,
            members: {
              include: {
                user: {
                  select: {
                    lastKnownTag: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!query || !query.guild) {
      await redis.set(`${Constants.redis.cache.economy.GUILD_USER}:${id}`, "noguild");
      await redis.expire(`${Constants.redis.cache.economy.GUILD_USER}:${id}`, ms("1 hour") / 1000);
      return undefined;
    } else {
      await redis.set(`${Constants.redis.cache.economy.GUILD_USER}:${id}`, query.guild.guildName);
      await redis.expire(`${Constants.redis.cache.economy.GUILD_USER}:${id}`, ms("1 hour") / 1000);
    }

    return query.guild;
  }

  return await getGuildByName(guildName);
}

export async function createGuild(name: string, owner: GuildMember) {
  await prisma.economyGuild.create({
    data: {
      guildName: name,
      createdAt: new Date(),
      ownerId: owner.user.id,
    },
  });
  await prisma.economyGuildMember.create({
    data: {
      userId: owner.user.id,
      guildName: name,
      joinedAt: new Date(),
    },
  });

  await redis.del(`${Constants.redis.cache.economy.GUILD_USER}:${owner.user.id}`);
}

export async function deleteGuild(name: string) {
  await prisma.economyGuildMember.deleteMany({
    where: {
      guildName: name,
    },
  });

  await prisma.economyGuild.delete({
    where: {
      guildName: name,
    },
  });
}

export async function addToGuildBank(name: string, amount: number, member: GuildMember) {
  await prisma.economyGuild.update({
    where: {
      guildName: name,
    },
    data: {
      balance: { increment: amount },
    },
  });
  await prisma.economyGuildMember.update({
    where: {
      userId: member.user.id,
    },
    data: {
      contributedMoney: { increment: amount },
    },
  });

  return checkUpgrade(name);
}

export async function addToGuildXP(name: string, amount: number, member: GuildMember) {
  await prisma.economyGuild.update({
    where: {
      guildName: name,
    },
    data: {
      xp: { increment: amount },
    },
  });
  await prisma.economyGuildMember.update({
    where: {
      userId: member.user.id,
    },
    data: {
      contributedXp: { increment: amount },
    },
  });

  return checkUpgrade(name);
}

export async function getMaxMembersForGuild(name: string) {
  const guild = await getGuildByName(name);

  let level = guild.level;

  if (level > 10) level = 10;

  const amount = 3 + Math.floor(level / 2) * 3;

  return (amount < 3 ? 3 : amount) > 10 ? 10 : amount < 3 ? 3 : amount;
}

export async function getRequiredForGuildUpgrade(name: string): Promise<GuildUpgradeRequirements> {
  if (await redis.exists(`${Constants.redis.cache.economy.GUILD_REQUIREMENTS}:${name}`)) {
    return JSON.parse(await redis.get(`${Constants.redis.cache.economy.GUILD_REQUIREMENTS}:${name}`));
  }

  const guild = await getGuildByName(name);

  const baseMoney = 3000000 * Math.pow(guild.level, 2);
  const baseXP = 1225 * Math.pow(guild.level, 2);

  const bonusMoney = 100000 * guild.members.length;
  const bonusXP = 75 * guild.members.length;

  await redis.set(
    `${Constants.redis.cache.economy.GUILD_REQUIREMENTS}:${name}`,
    JSON.stringify({
      money: baseMoney + bonusMoney,
      xp: baseXP + bonusXP,
    })
  );
  await redis.expire(`${Constants.redis.cache.economy.GUILD_REQUIREMENTS}:${name}`, ms("1 hour") / 1000);

  return {
    money: baseMoney + bonusMoney,
    xp: baseXP + bonusXP,
  };
}

export async function addMember(name: string, member: GuildMember) {
  const guild = await getGuildByName(name);

  if (guild.members.length + 1 > (await getMaxMembersForGuild(guild.guildName))) {
    return false;
  }

  await prisma.economyGuildMember.create({
    data: {
      userId: member.user.id,
      guildName: guild.guildName,
      joinedAt: new Date(),
    },
  });

  await redis.del(`${Constants.redis.cache.economy.GUILD_USER}:${member.user.id}`);

  return true;
}

export enum RemoveMemberMode {
  ID,
  TAG,
}

export async function removeMember(member: string, mode: RemoveMemberMode) {
  if (mode == RemoveMemberMode.ID) {
    await prisma.economyGuildMember.delete({
      where: {
        userId: member,
      },
    });
    await redis.del(`${Constants.redis.cache.economy.GUILD_USER}:${member}`);
    return true;
  } else {
    const user = await prisma.user.findFirst({
      where: {
        lastKnownTag: member,
      },
      select: {
        id: true,
      },
    });

    if (!user || !user.id) {
      return false;
    }

    const x = await prisma.economyGuildMember.delete({
      where: {
        userId: user.id,
      },
    });

    if (x) {
      await redis.del(`${Constants.redis.cache.economy.GUILD_USER}:${x.userId}`);

      return true;
    }
    return false;
  }
}

interface EconomyGuild {
  guildName: string;
  createdAt: Date;
  balance: bigint;
  xp: number;
  level: number;
  motd: string;
  ownerId: string;
  members?: EconomyGuildMember[];
}

interface EconomyGuildMember {
  userId: string;
  guildName: string;
  joinedAt: Date;
  contributedMoney: bigint;
  contributedXp: number;
}

async function checkUpgrade(guild: EconomyGuild | string): Promise<boolean> {
  if (typeof guild == "string") {
    guild = await getGuildByName(guild);
  }

  if (guild.level >= Constants.MAX_GUILD_LEVEL) return;
  const requirements = await getRequiredForGuildUpgrade(guild.guildName);

  if (Number(guild.balance) >= requirements.money && guild.xp >= requirements.xp) {
    await prisma.economyGuild.update({
      where: {
        guildName: guild.guildName,
      },
      data: {
        level: { increment: 1 },
        balance: { decrement: requirements.money },
        xp: { decrement: requirements.xp },
      },
    });

    logger.info(`${guild.guildName} has upgraded to level ${guild.level + 1}`);

    await redis.del(`${Constants.redis.cache.economy.GUILD_REQUIREMENTS}:${guild.guildName}`);

    const embed = new CustomEmbed().setColor(Constants.EMBED_SUCCESS_COLOR);

    const desc = [`**${guild.guildName}** has upgraded to level **${guild.level + 1}**\n\nyou have received:`];

    let cratesEarned = Math.floor(guild.level / 1.75);

    if (cratesEarned < 1) cratesEarned = 1;
    if (cratesEarned > 5) cratesEarned = 5;

    desc.push(` +**${cratesEarned}** basic crates`);

    if (guild.level < 5) {
      desc.push(" +**1**% multiplier");
    }

    if (guild.level < 10) {
      desc.push(" +**1** max xp gain");
    }

    embed.setHeader(guild.guildName);
    embed.setDescription(desc.join("\n"));
    embed.disableFooter();

    const payload: NotificationPayload = {
      memberId: "boob",
      payload: {
        content: `${guild.guildName} has levelled up!`,
        embed: embed,
      },
    };

    for (const member of guild.members) {
      await addInventoryItem(member.userId, "basic_crate", cratesEarned, false);

      if ((await getDmSettings(member.userId)).other) {
        payload.memberId = member.userId;
        addNotificationToQueue(payload);
      }
    }

    return true;
  }
  return false;
}

export async function setGuildMOTD(name: string, motd: string) {
  await prisma.economyGuild.update({
    where: {
      guildName: name,
    },
    data: {
      motd: motd,
    },
  });
}

export async function setOwner(guild: string, newOwner: string) {
  await prisma.economyGuild.updateMany({
    where: {
      guildName: {
        mode: "insensitive",
        equals: guild,
      },
    },
    data: {
      ownerId: newOwner,
    },
  });
}
